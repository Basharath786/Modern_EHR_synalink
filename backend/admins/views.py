"""Internal admin portal, super admin portal and the public registrations of Phase 4.

Legacy (CobaltService):
  internal admin : adminLogin (status check -> accounts.views.login), hospitalCounts / labCounts /
                   pharmacyCounts, list*Summery, listApproved*Summery, listAllDetails, downloadImage,
                   validate (HOSPITAL / LAB / PHARMACY -> approved_by + "set password" mail)
  super admin    : superAdminStatus, superAdminIdVerification, sendSuperAdminDetails, sendingVerificationCode,
                   checkVerificationCode, setSuperAdminPassword, superAdminLogin, superAdminResetPassword,
                   tempInternalAdminSummery, approvedInternalAdminSummery, validate (ADMIN), updateAdminStatus,
                   list*Summery of every user type
  public         : register (HOSPITAL, ADMIN)."""
import random
import time

from django.conf import settings
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsAnyAdmin, IsAuthenticatedUser, IsInternalAdmin, IsSuperAdmin, make_token
from accounts.crypto import decrypt_password, encrypt_password
from accounts.db import one, rows, run
from accounts.entities import ENTITY, GEO, SPECIALITIES, Form, blob, detail, file_field, listing, new_id, temp_id
from accounts.services import PASSWORD_POLICY
from accounts.setpw import approval_mail
from hospital.affiliation import split_ids
from patient.files import file_response

REVIEW = {"hospital", "lab", "pharmacy"}
APPROVED = "approved_by IS NOT NULL AND approved_by<>''"
PENDING = "(approved_by IS NULL OR approved_by='')"
EMAIL_COL = {"hospital": "hospital_email", "lab": "labemail", "pharmacy": "pharmacy_email"}


def _me(request):
    """Value written to approved_by (varchar(10)): the internal admin ID, or SUPERADMIN."""
    return request.user.permanent_id if request.user.role == "ADMIN" else "SUPERADMIN"


def _approver_names(items):
    ids = {i.get("approved_by") for i in items if i.get("approved_by")}
    names = {r["permanentid"]: r["fullname"] for r in rows(
        f"SELECT permanentid, fullname FROM internal_admin WHERE permanentid IN ({','.join(['%s'] * len(ids))})", list(ids))} if ids else {}
    names["SUPERADMIN"] = "Super admin"
    for i in items:
        if i.get("approved_by"):
            i["approved_by_name"] = names.get(i["approved_by"], i["approved_by"])
    return items


def _counts(table):
    """Legacy getApprovedByCounts."""
    r = one(f"SELECT COUNT(*) total, SUM({APPROVED}) approved FROM {table} WHERE permanentid IS NOT NULL")
    total, approved = r["total"] or 0, int(r["approved"] or 0)
    return {"total": total, "approved": approved, "pending": total - approved}


# ====================================================================== review (internal + super admin)
@api_view(["GET"])
@permission_classes([IsAnyAdmin])
def dashboard(request):
    out = {k: _counts(k) for k in REVIEW}
    if request.user.role == "SUPER_ADMIN":
        c = lambda sql: one(sql)["n"]
        out.update({
            "admins": {"pending": c("SELECT COUNT(*) n FROM internal_admin_temp"), "approved": c("SELECT COUNT(*) n FROM internal_admin"),
                       "active": c("SELECT COUNT(*) n FROM internal_admin WHERE status='ACTIVE'")},
            "doctors": c("SELECT COUNT(*) n FROM doctor"), "nurses": c("SELECT COUNT(*) n FROM nurse"),
            "receptionists": c("SELECT COUNT(*) n FROM receptionist"), "departments": c("SELECT COUNT(*) n FROM department"),
            "patients": {"approved": c(f"SELECT COUNT(*) n FROM patient WHERE {APPROVED}"), "pending": c(f"SELECT COUNT(*) n FROM patient WHERE {PENDING}"),
                         "temporary": c("SELECT COUNT(*) n FROM patient_temp")},
            "children": c("SELECT COUNT(*) n FROM child_reg"), "lab_staff": c("SELECT COUNT(*) n FROM lab_staff"),
            "pharmacy_staff": c("SELECT COUNT(*) n FROM pharmacy_staff"),
        })
    else:
        me = one("SELECT fullname FROM internal_admin WHERE permanentid=%s", [request.user.permanent_id]) or {}
        out["name"] = me.get("fullname")
        out["approved_by_me"] = {k: one(f"SELECT COUNT(*) n FROM {k} WHERE approved_by=%s", [request.user.permanent_id])["n"] for k in REVIEW}
    return Response(out)


@api_view(["GET"])
@permission_classes([IsAnyAdmin])
def entities(request, kind):
    if kind not in REVIEW:
        return Response({"status": "not_found"}, status=404)
    status = request.GET.get("status", "pending")
    where = "permanentid IS NOT NULL AND " + (APPROVED if status == "approved" else PENDING if status == "pending" else "1=1")
    return Response({"items": _approver_names(listing(kind, where))})


@api_view(["GET"])
@permission_classes([IsAnyAdmin])
def entity_detail(request, kind, pid):
    if kind not in REVIEW:
        return Response({"status": "not_found"}, status=404)
    d = detail(kind, pid)
    if not d:
        return Response({"status": "not_found"}, status=404)
    _approver_names([d])
    d["approved"] = bool((d.get("approved_by") or "").strip())
    # affiliations as names (legacy pages showed the raw comma lists)
    aff = {}
    if kind == "hospital":
        for key, col, t, name in (("labs", "affiliated_labs_list", "lab", "labname"), ("pharmacies", "affiliated_pharmacy_list", "pharmacy", "pharmacy_name")):
            ids = split_ids(d.get(col))
            aff[key] = rows(f"SELECT permanentid, {name} AS name, city FROM {t} WHERE permanentid IN ({','.join(['%s'] * len(ids))})", ids) if ids else []
        d["staff"] = {t: one(f"SELECT COUNT(*) n FROM {t} WHERE hospital_id=%s", [pid])["n"] for t in ("doctor", "nurse", "receptionist", "department")}
    else:
        ids = split_ids(d.get("affiliated_hospital_list"))
        aff["hospitals"] = rows(f"SELECT permanentid, hospital_name AS name, city FROM hospital WHERE permanentid IN ({','.join(['%s'] * len(ids))})", ids) if ids else []
    lg = one("SELECT pswrd, systemLoginTime FROM login WHERE permanentid=%s", [pid])
    d["password_set"] = bool(lg and lg.get("pswrd"))
    return Response({"item": d, "affiliations": aff})


@api_view(["GET"])
@permission_classes([IsAnyAdmin])
def entity_file(request, kind, pid, col):
    if kind not in REVIEW:
        return Response({"status": "not_found"}, status=404)
    return file_response(blob(kind, pid, col), f"{pid}_{col}")


@api_view(["POST"])
@permission_classes([IsAnyAdmin])
def entity_approve(request, kind, pid):
    """Legacy validate(HOSPITAL|LAB|PHARMACY, permanent_id, approved_by)."""
    if kind not in REVIEW:
        return Response({"status": "not_found"}, status=404)
    with transaction.atomic():
        n = run(f"UPDATE {kind} SET approved_by=%s, date_time=NOW() WHERE permanentid=%s AND {PENDING}", [_me(request), pid])
        if not n:
            return Response({"status": "not_pending", "message": "Already approved or not found."}, status=409)
        if not one("SELECT permanentid FROM login WHERE permanentid=%s", [pid]):
            run("INSERT INTO login (permanentid, pswrd, isdefault_password, systemLoginTime, pswrd_changed_time, failed_attempt, account_locked, lock_time) "
                "VALUES (%s,'','YES',NOW(),NOW(),0,'NO',0)", [pid])
    email = (one(f"SELECT {EMAIL_COL[kind]} e FROM {kind} WHERE permanentid=%s", [pid]) or {}).get("e")
    approval_mail(pid, kind.upper(), email, "approved by the internal admin")
    return Response({"status": "approved", "permanentid": pid, "approved_by": _me(request)})


@api_view(["GET"])
@permission_classes([IsInternalAdmin])
def my_profile(request):
    return Response({"admin": detail("admin", request.user.permanent_id)})


@api_view(["GET"])
@permission_classes([IsInternalAdmin])
def my_file(request):
    return file_response(blob("admin", request.user.permanent_id, "govtidfile"), f"{request.user.permanent_id}_govtid")


# ====================================================================== super admin: internal admins + all users
@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def admins(request):
    if request.GET.get("status", "pending") == "pending":
        return Response({"items": listing("admin_temp", order="date_time DESC")})
    items = listing("admin", order="date_time DESC")
    for i in items:
        lg = one("SELECT pswrd, systemLoginTime FROM login WHERE permanentid=%s", [i["permanentid"]])
        i["password_set"], i["last_login"] = bool(lg and lg.get("pswrd")), (lg or {}).get("systemLoginTime")
    return Response({"items": items})


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def admin_detail(request, ident):
    kind = "admin" if ident.upper().startswith("ADMIN") else "admin_temp"
    d = detail(kind, ident)
    if not d:
        return Response({"status": "not_found"}, status=404)
    d["pending"] = kind == "admin_temp"
    if kind == "admin":
        d["approved_counts"] = {k: one(f"SELECT COUNT(*) n FROM {k} WHERE approved_by=%s", [ident])["n"] for k in REVIEW}
    return Response({"item": d})


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def admin_file(request, ident):
    kind = "admin" if ident.upper().startswith("ADMIN") else "admin_temp"
    return file_response(blob(kind, ident, "govtidfile"), f"{ident}_govtid")


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def admin_approve(request, ident):
    """Legacy validate(ADMIN): internal_admin_temp -> internal_admin with a new ADMINxxxxx ID."""
    with transaction.atomic():
        t = one("SELECT * FROM internal_admin_temp WHERE temp_id=%s FOR UPDATE", [ident])
        if not t:
            return Response({"status": "not_found"}, status=404)
        pid = new_id("ADMIN", "internal_admin")
        run("INSERT INTO internal_admin (temp_id, permanentid, pswrd, fullname, organizationname, empid, address, workphone, mobno, workemail, govtidtype, "
            "govtidno, govtidfile, status, date_time) VALUES (%s,%s,'',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ACTIVE',NOW())",
            [t["temp_id"], pid, t["fullname"], t["organizationname"], t["empid"], t["address"], t["workphone"], t["mobno"], t["workemail"],
             t["govtidtype"], t["govtidno"], t["govtidfile"]])
        run("INSERT INTO login (permanentid, pswrd, isdefault_password, systemLoginTime, pswrd_changed_time, failed_attempt, account_locked, lock_time) "
            "VALUES (%s,'','YES',NOW(),NOW(),0,'NO',0)", [pid])
        run("DELETE FROM internal_admin_temp WHERE temp_id=%s", [ident])
    approval_mail(pid, "INTERNAL ADMIN", t["workemail"], "approved by the super admin")
    return Response({"status": "approved", "permanentid": pid})


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def admin_status(request, ident):
    """Legacy updateAdminStatus (ACTIVE / INACTIVE). An inactive admin cannot log in."""
    st = str(request.data.get("status", "")).strip().upper()
    if st not in ("ACTIVE", "INACTIVE"):
        return Response({"status": "invalid"}, status=400)
    if not run("UPDATE internal_admin SET status=%s WHERE permanentid=%s", [st, ident]) and not one(
            "SELECT 1 x FROM internal_admin WHERE permanentid=%s", [ident]):
        return Response({"status": "not_found"}, status=404)
    a = one("SELECT workemail, fullname FROM internal_admin WHERE permanentid=%s", [ident]) or {}
    mailer.send(a.get("workemail"), f"Your internal admin account is now {st.lower()}", "Account status changed",
                [f"Dear {mailer.e(a.get('fullname'))}, your account <b>{ident}</b> is now <b>{st}</b>."])
    return Response({"status": "updated", "admin_status": st})


USERS = {
    # kind: (entity, where, order)
    "doctor": ("doctor", "1=1", "date_time DESC"), "nurse": ("nurse", "1=1", "date_time DESC"),
    "receptionist": ("receptionist", "1=1", "date_time DESC"), "department": ("department", "1=1", "hospital_name, deptname"),
    "patient": ("patient", APPROVED, "date_time DESC"), "patient_pending": ("patient", PENDING, "date_time DESC"),
    "patient_temp": ("patient_temp", "1=1", "date_time DESC"), "child": ("child", "1=1", "date_time DESC"),
    "lab_staff": ("lab_staff", "1=1", "date_time DESC"), "pharmacy_staff": ("pharmacy_staff", "1=1", "date_time DESC"),
}


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def users(request, kind):
    if kind not in USERS:
        return Response({"status": "not_found"}, status=404)
    ent, where, order = USERS[kind]
    return Response({"items": listing(ent, where, order=order)})


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def user_detail(request, kind, ident):
    if kind not in USERS:
        return Response({"status": "not_found"}, status=404)
    d = detail(USERS[kind][0], ident)
    return Response({"item": d}) if d else Response({"status": "not_found"}, status=404)


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def user_file(request, kind, ident, col):
    if kind not in USERS:
        return Response({"status": "not_found"}, status=404)
    return file_response(blob(USERS[kind][0], ident, col), f"{ident}_{col}")


# ====================================================================== super admin auth
SA_CODE_MS = 300_000          # legacy: verification code valid 5 minutes
SA_LOCK_AFTER = 3             # legacy: 3rd wrong password locks until reset


def _sa(identifier):
    return one("SELECT * FROM superadmin WHERE super_admin_id=%s", [identifier])


def _sa_id(request):
    return str(request.data.get("super_admin_id", "")).strip().lower()


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def sa_status(request):
    return Response({"configured": one("SELECT COUNT(*) n FROM superadmin")["n"] > 0})


def _send_sa_code(sid):
    code = f"{random.randint(0, 9999):04d}"
    run("UPDATE superadmin SET verification_code=%s, verification_code_settime=%s WHERE super_admin_id=%s", [code, int(time.time() * 1000), sid])
    if settings.DEV_ECHO_OTP:
        print(f"\n[DEV_ECHO_OTP] super admin verification code for {sid}: {code}\n", flush=True)
    mailer.send(sid, "Cobalt EHR - super admin verification code", "Dear Super Admin,", [
        f"Verification code: <b style='font-size:22px;letter-spacing:4px'>{code}</b>", "Use this verification code within 5 minutes to avoid expiry."])


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def sa_setup(request):
    """First-time setup: superAdminIdVerification + sendSuperAdminDetails + sendingVerificationCode."""
    sid = _sa_id(request)
    if not sid or sid != settings.SUPER_ADMIN_ID.strip().lower():
        return Response({"status": "id_error", "message": "This is not the super admin ID."}, status=400)
    if one("SELECT COUNT(*) n FROM superadmin")["n"] and _sa(sid) and (_sa(sid).get("pswrd") or ""):
        return Response({"status": "already_configured", "message": "The super admin is already set up. Please log in."}, status=409)
    if not _sa(sid):
        run("INSERT INTO superadmin (super_admin_id, failed_attempt, account_locked) VALUES (%s,0,'NO')", [sid])
    _send_sa_code(sid)
    return Response({"status": "code_sent"})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def sa_send_code(request):
    """Forgot password: sendingVerificationCode for the existing super admin."""
    sid = _sa_id(request)
    if not _sa(sid):
        return Response({"status": "id_error"}, status=404)
    _send_sa_code(sid)
    return Response({"status": "code_sent"})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def sa_check_code(request):
    """checkVerificationCode -> expired | not matched | matched (+ a 10-minute token to set the password)."""
    sid = _sa_id(request)
    code = str(request.data.get("verification_code", "")).strip()
    r = _sa(sid)
    if not r or not r.get("verification_code"):
        return Response({"status": "null"}, status=400)
    if int(time.time() * 1000) > (r.get("verification_code_settime") or 0) + SA_CODE_MS:
        return Response({"status": "expired"}, status=410)
    if code != r["verification_code"]:
        return Response({"status": "not matched"}, status=400)
    run("UPDATE superadmin SET verification_code=NULL, verification_code_settime=NULL WHERE super_admin_id=%s", [sid])
    return Response({"status": "matched", "token": make_token(sid, "SUPER_ADMIN", scope="sa_password", minutes=10)})


def _sa_policy(pw):
    # superadmin.pswrd is varchar(32): AES of more than 15 bytes no longer fits, so max 15 characters
    return PASSWORD_POLICY.match(pw) and len(pw.encode()) <= 15


@api_view(["POST"])
@permission_classes([IsAuthenticatedUser])
def sa_set_password(request):
    """setSuperAdminPassword / superAdminResetPassword (token from sa_check_code)."""
    if request.user.role != "SUPER_ADMIN" or request.user.scope != "sa_password":
        return Response({"status": "forbidden"}, status=403)
    pw, confirm = str(request.data.get("password", "")), str(request.data.get("confirm_password", ""))
    if pw != confirm:
        return Response({"status": "mismatch"}, status=400)
    if not _sa_policy(pw):
        return Response({"status": "weak_password", "message": "8-15 characters with upper and lower case letters, a number and a special character."}, status=400)
    run("UPDATE superadmin SET pswrd=%s, pswrd_changed_time=NOW(), failed_attempt=0, account_locked='NO' WHERE super_admin_id=%s",
        [encrypt_password(pw), request.user.permanent_id])
    return Response({"status": "password_set"})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def sa_login(request):
    """superAdminLogin: 3 wrong passwords lock the account until it is reset with a verification code."""
    sid = _sa_id(request)
    pw = str(request.data.get("password", ""))
    if not sid or not pw:
        return Response({"status": "missing_fields"}, status=400)
    r = _sa(sid)
    if not r:
        return Response({"status": "id_error"}, status=401)
    if not (r.get("pswrd") or ""):
        return Response({"status": "password_not_set"}, status=401)
    failed = r.get("failed_attempt") or 0
    if failed > SA_LOCK_AFTER or "NO" not in (r.get("account_locked") or ""):
        return Response({"status": "locked_account"}, status=401)
    try:
        ok = pw == decrypt_password(r["pswrd"])
    except Exception:
        ok = False
    if not ok:
        failed += 1
        locked = "YES" if failed >= SA_LOCK_AFTER else "NO"
        run("UPDATE superadmin SET failed_attempt=%s, account_locked=%s WHERE super_admin_id=%s", [failed, locked, sid])
        return Response({"status": "locked_account" if locked == "YES" else "password_error"}, status=401)
    prev = r.get("systemLoginTime")
    run("UPDATE superadmin SET failed_attempt=0, account_locked='NO', systemLoginTime=NOW() WHERE super_admin_id=%s", [sid])
    # legacy superAdminPasswordValid compared only the days part of the Period (<= 90), so it never expired
    return Response({"status": "success", "token": make_token(sid, "SUPER_ADMIN"),
                     "user": {"permanentid": sid, "role": "SUPER_ADMIN", "portal": "super-admin", "name": "Super Admin",
                              "last_login": prev.isoformat() if prev else None}})


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def sa_change_password(request):
    cur, new, confirm = (str(request.data.get(k, "")) for k in ("current_password", "new_password", "confirm_password"))
    r = _sa(request.user.permanent_id) or {}
    try:
        ok = cur == decrypt_password(r.get("pswrd"))
    except Exception:
        ok = False
    if not ok:
        return Response({"status": "wrong_current_password"}, status=400)
    if new != confirm:
        return Response({"status": "mismatch"}, status=400)
    if new == cur:
        return Response({"status": "same_password"}, status=400)
    if not _sa_policy(new):
        return Response({"status": "weak_password"}, status=400)
    run("UPDATE superadmin SET pswrd=%s, pswrd_changed_time=NOW() WHERE super_admin_id=%s", [encrypt_password(new), request.user.permanent_id])
    return Response({"status": "password_changed"})


# ====================================================================== public registrations
@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def reference(request):
    return Response({"states": GEO, "specialities": SPECIALITIES})


HOSPITAL_TYPES = ["Multi Speciality", "General Hospital", "Womens hospitals", "Childrens hospitals", "Cardiac hospitals", " Oncology hospitals",
                  "Psychiatric hospitals", "Trauma centers", " Cancer treatment centers"]


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def register_hospital(request):
    """Legacy register(HOSPITAL) from register/hospital-registration.html."""
    f = Form(request.data)
    f.text("hospital_name", "Hospital name", max_len=50, pattern=r"[#.0-9A-Za-z\s,-]+", msg="Hospital name can contain letters, numbers and # . , -")
    f.text("accreditation", "Accreditation number", pattern=r"[A-Za-z0-9-]{11}", msg="Please match the requested format (Ex : H-1234-1234)")
    f.choice("category", "Private / Govt", ["Private", "Government"])
    f.choice("type", "Type of hospital", HOSPITAL_TYPES)
    f.number("providers", "No. of doctors", max_value=999999)
    f.number("no_wards", "No. of wards", max_value=9999)
    f.number("size", "No. of beds", max_value=9999)
    f.text("blood_bank", "Blood bank number", required=False, max_len=11, pattern=r"[A-Za-z0-9]+", msg="Only letters and numbers")
    f.text("insurance_provider", "Insurance provider", required=False, max_len=45)
    f.text("address", "Address", max_len=60)
    f.address_block()
    mob = f.mobile("administration_no", "Administration mobile number")
    f.email("hospital_email", "Email")
    f.text("land_phone", "Land phone", required=False, pattern=r"\d{6,11}", msg="Land phone must be up to 11 digits")
    f.text("contact_person", "Administration name", required=False, max_len=40, pattern=r"[A-Za-z ]+", msg="Only letters are allowed")
    f.text("pan_no", "PAN number", pattern=r"[A-Z]{5}[0-9]{4}[A-Z]", msg="Please match the requested format (Ex : ABCDE1234F)")
    f.text("gst_no", "GST number", pattern=r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9]", msg="Please match the requested format (Ex : 12ABCDE1234F5G6)")
    f.text("reg_no", "Civil registration number", pattern=r"[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}",
           msg="Please match the requested format (Ex : U12345AB1234ABC123456)")
    specs = request.data.getlist("specialities") if hasattr(request.data, "getlist") else request.data.get("specialities") or []
    if isinstance(specs, str):
        specs = [s for s in specs.split(",") if s]
    specs = [s for s in specs if s in SPECIALITIES]
    if not specs:
        f.errors["specialities"] = "Please select at least one speciality"
    files = {}
    for col, label in (("pan_card", "PAN card proof"), ("gst_proof", "GST number proof"), ("registration_proof", "Civil registration proof")):
        data, err = file_field(request, col, label)
        if err:
            f.errors[col] = err
        files[col] = data
    if mob and one("SELECT permanentid FROM hospital WHERE administration_no=%s", [mob]):
        f.errors["administration_no"] = "Mobile number already registered. Please use a different number or login."
    if f.errors:
        return f.response()
    c = f.clean
    with transaction.atomic():
        pid = new_id("HOS", "hospital")
        run("INSERT INTO hospital (permanentid, hospital_name, reg_no, pan_no, gst_no, accreditation, providers, size, type, no_wards, category, address, city, "
            "state, country, zipcode, administration_no, hospital_email, blood_bank, land_phone, contact_person_name, insurance_provider, specialities_list, "
            "pan_card, gst_proof, registration_proof, date_time) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())",
            [pid, c["hospital_name"], c["reg_no"], c["pan_no"], c["gst_no"], c["accreditation"], c["providers"], c["size"], c["type"], c["no_wards"],
             c["category"], c["address"], c["city"], c["state"], c["country"], int(c["zipcode"]), c["administration_no"], c["hospital_email"],
             c["blood_bank"] or "NA", c["land_phone"] or None, c["contact_person"] or "", c["insurance_provider"] or "NA", ",".join(specs),
             files["pan_card"], files["gst_proof"], files["registration_proof"]])
        run("INSERT INTO login (permanentid, pswrd, isdefault_password, systemLoginTime, pswrd_changed_time, failed_attempt, account_locked, lock_time) "
            "VALUES (%s,'','YES',NOW(),NOW(),0,'NO',0)", [pid])
    mailer.send(c["hospital_email"], f"HOSPITAL registration successful - Permanent ID: {pid}", "Welcome to Cobalt EHR", [
        "Your HOSPITAL registration has been completed successfully.", f"Your Permanent ID: <b>{pid}</b>",
        "Please wait for admin approval. Once approved, you will receive a link to set your password and access the portal."])
    return Response({"status": "registered", "permanentid": pid,
                     "message": f"HOSPITAL registered successfully. Permanent ID: {pid}. Please wait for admin approval to set your password."}, status=201)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def register_internal_admin(request):
    """Legacy register(ADMIN): row in internal_admin_temp, waits for the super admin."""
    f = Form(request.data)
    f.text("fullname", "Full name", max_len=50, pattern=r"[A-Za-z ]+", msg="Name should contain only letters")
    f.text("empid", "Employee ID", pattern=r"\d{6}", msg="Employee ID must be 6 digits")
    f.text("organizationname", "Organization name", max_len=40, pattern=r"[ A-Za-z0-9_@./#&+-]+", msg="Please enter a valid organization name")
    f.text("workphone", "Work phone (landline)", pattern=r"\d{11}", msg="Work phone must be 11 digits")
    f.mobile("mobno", "Alternate number (mobile)")
    email = f.email("workemail", "Work email")
    f.text("address", "Address", max_len=60, pattern=r"[#.0-9A-Za-z\s,-]+", msg="Address can contain letters, numbers and # . , -")
    f.govt_id()
    data, err = file_field(request, "govtidfile", "ID proof")
    if err:
        f.errors["govtidfile"] = err
    if email and (one("SELECT 1 x FROM internal_admin_temp WHERE workemail=%s", [email]) or one("SELECT 1 x FROM internal_admin WHERE workemail=%s", [email])):
        f.errors["workemail"] = "This email is already registered."
    if f.errors:
        return f.response()
    c = f.clean
    tid = temp_id("internal_admin_temp")
    run("INSERT INTO internal_admin_temp (temp_id, fullname, organizationname, empid, address, workphone, mobno, workemail, govtidtype, govtidno, govtidfile, date_time) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())",
        [tid, c["fullname"], c["organizationname"], c["empid"], c["address"], c["workphone"], c["mobno"], c["workemail"], c["govtidtype"], c["govtidno"], data])
    mailer.send(c["workemail"], "Internal admin registration received", f"Dear {c['fullname']},", [
        "Thank you for registering as an internal admin with Cobalt EHR.", "Your details will be verified by the super admin.",
        "You will receive your Permanent ID and a link to set your password after approval."])
    mailer.send(settings.SUPER_ADMIN_ID, "New internal admin registration", "New internal admin registration",
                [f"<b>{mailer.e(c['fullname'])}</b> ({mailer.e(c['organizationname'])}) registered and waits for your approval."])
    return Response({"status": "registered", "message": "Registration successful. The super admin will review your details."}, status=201)
