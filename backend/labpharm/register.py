"""Public registrations of Phase 5 (laboratory, pharmacy, patient self sign-up) and the reception /
hospital desk extras (register a patient with OTP, read-only hospital directory, receptionist profile).

Patient registration (legacy register PATIENT, source SELF / RECEPTION, OTP to WhatsApp + e-mail, then
patient/setPassword):
  1. details are validated and parked in patient_temp with status 'OTP' (the legacy code inserted the
     patient before the OTP was checked, leaving half-registered patients behind);
  2. the 6-digit OTP (10 minutes, 3 tries) confirms the mobile number, then the patient row (PAT…) and its
     login row are created;
  3. self sign-up: the response carries a one-time token, so the patient chooses the password right away
     (auth/set-password/complete). Reception sign-up: the patient gets the "set your password" link.
The legacy patient/setPassword accepted only a Patient ID; it is not ported."""
import hmac
import secrets

from django.conf import settings
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsDesk, IsReceptionist
from accounts.db import one, rows, run
from accounts.entities import GEO, Form, blob, detail, file_field, new_id, temp_id
from accounts.setpw import TOKEN_MINUTES, set_password_link, sha256
from booking.views import reception_hospital
from patient.files import file_response

LAB_SPECIALITIES = ["Serum", "Blood", "Stool", "Specimen", "Plasma", "Urine", "Culture", "Biposy", "CT SCAN", "MRI", "X-Ray", "Electrodiagnostics",
                    "Procedures", "Ultrasound", "Nuclear Imaging", "Serology", "CSF", "Fluoroscopy", "Diagnostic Test"]
OTP_MINUTES, OTP_TRIES, RESEND_SECONDS = 10, 3, 30


def _login_row(pid):
    run("INSERT INTO login (permanentid, pswrd, isdefault_password, systemLoginTime, pswrd_changed_time, failed_attempt, account_locked, lock_time) "
        "VALUES (%s,'','YES',NOW(),NOW(),0,'NO',0)", [pid])


# ====================================================================== laboratory / pharmacy registration
def _org_form(request, kind):
    f = Form(request.data)
    name_col = "labname" if kind == "lab" else "pharmacy_name"
    f.text(name_col, "Laboratory name" if kind == "lab" else "Pharmacy name", max_len=45, pattern=r"[#.0-9A-Za-z\s,-]+", msg="Name can contain letters, numbers and # . , -")
    f.text("accreditation", "Accreditation number", pattern=r"[A-Za-z0-9-]{11}", msg="Please match the requested format (Ex : H-1234-1234)")
    if kind == "lab":
        f.number("technicians", "No. of technicians", max_value=99)
        f.number("assigneddoctors", "No. of doctors", max_value=99)
        f.choice("category", "Private / Government", ["Private", "Government"])
    else:
        f.number("no_of_pharmacist", "No. of pharmacists", max_value=999)
        f.choice("category", "Type", ["Private", "Governament", "Government"])
    f.text("insurance_provider", "Insurance provider", required=False, max_len=45)
    f.text("address", "Address", max_len=60, pattern=r"[#./0-9A-Za-z\s,-]+", msg="Address can contain letters, numbers and # . , / -")
    f.address_block()
    mob = f.mobile("administration_no", "Administration mobile number")
    email_col = "labemail" if kind == "lab" else "pharmacy_email"
    email = f.email(email_col, "Email")
    f.text("land_phone", "Land phone", pattern=r"\d{11}", msg="Land phone must be 11 digits")
    f.text("contact_person_name", "Contact person name", max_len=40 if kind == "lab" else 20, pattern=r"[A-Za-z ]+", msg="Only letters are allowed")
    f.mobile("contact_person_phone", "Contact person mobile")
    f.email("contact_person_email", "Contact person email", required=kind == "pharmacy", max_len=45)
    f.text("civilno", "Civil regn. / CIN number" if kind == "lab" else "D.L. number", max_len=21 if kind == "lab" else 25, pattern=r"[A-Za-z0-9/-]+",
           msg="Only letters, numbers, / and -")
    f.text("pan_no", "PAN number", pattern=r"[A-Z]{5}[0-9]{4}[A-Z]", msg="Please match the requested format (Ex : ABCDE1234F)")
    files = {}
    for col, label in (("civilimage", "Civil regn. proof" if kind == "lab" else "D.L. proof"), ("panimage", "PAN card proof")):
        data, err = file_field(request, col, label)
        if err:
            f.errors[col] = err
        files[col] = data
    table = kind
    if mob and one(f"SELECT permanentid FROM {table} WHERE administration_no=%s", [mob]):
        f.errors["administration_no"] = "Mobile number already registered. Please use a different number or login."
    if email and one(f"SELECT permanentid FROM {table} WHERE {email_col}=%s", [email]):
        f.errors[email_col] = "Email id already exists"
    civ = f.clean.get("civilno")
    if civ and one(f"SELECT civilno FROM {table} WHERE civilno=%s", [civ]):          # civilno is the table's primary key
        f.errors["civilno"] = "This registration number is already registered"
    return f, files


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def register_lab(request):
    """Legacy register/lab-registration.html (v1/register LAB)."""
    f, files = _org_form(request, "lab")
    specs = request.data.getlist("specialities") if hasattr(request.data, "getlist") else request.data.get("specialities") or []
    specs = [s for s in (specs.split(",") if isinstance(specs, str) else specs) if s in LAB_SPECIALITIES]
    if f.errors:
        return f.response()
    c = f.clean
    with transaction.atomic():
        pid = new_id("LAB", "lab")
        run("INSERT INTO lab (permanentid, labname, civilno, accreditation, pan_no, technicians, assigneddoctors, category, address, city, state, country, zipcode, "
            "administration_no, labemail, land_phone, contact_person_name, contact_person_phone, contact_person_email, insurance_provider, specialities_list, "
            "affiliated_hospital_list, panimage, civilimage, date_time) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'',%s,%s,NOW())",
            [pid, c["labname"], c["civilno"], c["accreditation"], c["pan_no"], c["technicians"], c["assigneddoctors"], c["category"], c["address"], c["city"],
             c["state"], c["country"], int(c["zipcode"]), c["administration_no"], c["labemail"], c["land_phone"], c["contact_person_name"], c["contact_person_phone"],
             c["contact_person_email"] or "", c["insurance_provider"] or "Not Provided", ",".join(specs), files["panimage"], files["civilimage"]])
        _login_row(pid)
    return _org_done("LAB", pid, c["labname"], c["labemail"], c["administration_no"], c["contact_person_name"])


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def register_pharmacy(request):
    """Legacy register/pharmacy-registration.html (v1/register PHARMACY)."""
    f, files = _org_form(request, "pharmacy")
    if f.errors:
        return f.response()
    c = f.clean
    with transaction.atomic():
        pid = new_id("PHAR", "pharmacy")
        run("INSERT INTO pharmacy (permanentid, pharmacy_name, civilno, accreditation, pan_no, no_of_pharmacist, category, address, city, state, country, zipcode, "
            "administration_no, pharmacy_email, land_phone, contact_person_name, contact_person_phone, contact_person_email, insurance_provider, "
            "affiliated_hospital_list, panimage, civilimage, date_time) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'',%s,%s,NOW())",
            [pid, c["pharmacy_name"], c["civilno"], c["accreditation"], c["pan_no"], c["no_of_pharmacist"], c["category"], c["address"], c["city"], c["state"],
             c["country"], int(c["zipcode"]), c["administration_no"], c["pharmacy_email"], c["land_phone"], c["contact_person_name"], c["contact_person_phone"],
             c["contact_person_email"], c["insurance_provider"] or "Not Provided", files["panimage"], files["civilimage"]])
        _login_row(pid)
    return _org_done("PHARMACY", pid, c["pharmacy_name"], c["pharmacy_email"], c["administration_no"], c["contact_person_name"])


def _org_done(label, pid, name, email, mobile=None, contact=None):
    from accounts import whatsapp
    whatsapp.new_permanent_id(mobile, contact or name, pid)
    mailer.send(email, f"{label} registration successful - Permanent ID: {pid}", "Welcome to Cobalt EHR", [
        f"Your {label} registration ({mailer.e(name)}) has been completed successfully.", f"Your Permanent ID: <b>{pid}</b>",
        "Please wait for admin approval. Once approved, you will receive a link to set your password and access the portal."])
    return Response({"status": "registered", "permanentid": pid,
                     "message": f"{label} registered successfully. Permanent ID: {pid}. Please wait for admin approval to set your password."}, status=201)


# ====================================================================== patient registration (self + reception)
BLOOD = ["A +ve", "A -ve", "B +ve", "B -ve", "O +ve", "O -ve", "AB +ve", "AB -ve"]


def _patient_form(request, desk):
    """Self sign-up: everything marked * on register/patient-registration.html. Reception: only name, DOB,
    gender and mobile are mandatory (reception/patient-register.html)."""
    req = not desk
    f = Form(request.data)
    f.text("fname", "First name", max_len=45, pattern=r"[A-Za-z ]+", msg="First name should contain only letters")
    f.text("mname", "Middle name", required=False, max_len=45, pattern=r"[A-Za-z]+", msg="Middle name should contain only letters")
    f.text("lname", "Last name", max_len=45, pattern=r"[A-Za-z]+", msg="Last name should contain only letters")
    f.dob()
    f.choice("gender", "Gender", ["Male", "Female", "Other"])
    f.choice("marital", "Marital status", ["Single", "Married", "Widowed", "Divorced"], required=req)
    f.choice("bloodgroup", "Blood group", BLOOD, required=False)
    f.text("insurance_provider", "Insurance provider", required=False, max_len=40)
    f.text("address", "Address", required=req, max_len=60)
    if req or f.get("state") or f.get("city") or f.get("zipcode"):
        f.address_block()
    else:
        f.clean.update(country=f.get("country") or "India", state="", city="", zipcode="")
    mob = f.mobile("mobno", "Mobile number")
    f.mobile("hphone", "Alternate mobile number", required=False)
    f.mobile("emergencycontact", "Emergency mobile number", required=req)
    f.email("email", "Email", required=req)
    if req or f.get("govtidno") or f.get("govtidtype"):
        f.govt_id()
    else:
        f.clean.update(govtidtype="", govtidno="")
    data, err = file_field(request, "govtidfile", "ID proof", required=req)
    if err:
        f.errors["govtidfile"] = err
    if mob and one("SELECT permanentid FROM patient WHERE mobno=%s", [mob]):
        f.errors["mobno"] = "Mobile number already registered. Please use a different number or login."
    return f, data


def _deliver(temp, mobile, email, otp):
    if settings.DEV_ECHO_OTP:
        print(f"\n[DEV_ECHO_OTP] registration OTP for {temp} ({mobile}): {otp}\n", flush=True)
        return True
    from patient.notify import send_email_otp, send_whatsapp_otp
    wa = send_whatsapp_otp(str(mobile), otp)
    em = send_email_otp(email, otp) if email else False
    return wa or em


def _start(request, desk):
    f, data = _patient_form(request, desk)
    if f.errors:
        return f.response()
    c = f.clean
    tid = temp_id("patient_temp")
    otp = f"{secrets.randbelow(900000) + 100000}"
    # drop older unfinished attempts for the same mobile
    run("DELETE FROM patient_temp WHERE mobno=%s AND status='OTP'", [c["mobno"]])
    run("INSERT INTO patient_temp (temp_id, fname, lname, mname, dob, age, gender, marital, address, city, state, country, zipcode, mobno, otp, otp_generated_at, "
        "otp_verified, otp_attempts, hphone, emergencycontact, email, bloodgroup, insurance_provider, govtidtype, govtidno, govtidfile, status, hold_attempt, approved_by, "
        "date_time) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),0,0,%s,%s,%s,%s,%s,%s,%s,%s,'OTP',0,%s,NOW())",
        [tid, c["fname"], c["lname"], c["mname"] or None, c["dob"], c["age"], c["gender"], c["marital"] or "", c["address"] or "", c["city"] or "", c["state"] or "",
         c["country"] or "India", int(c["zipcode"]) if c.get("zipcode") else 0, c["mobno"], otp, c["hphone"], c["emergencycontact"] or 0, c["email"] or None,
         c["bloodgroup"] or None, c["insurance_provider"] or None, c["govtidtype"] or "", c["govtidno"] or "", data,
         request.user.permanent_id if desk else None])
    if not _deliver(tid, c["mobno"], c["email"], otp):
        run("DELETE FROM patient_temp WHERE temp_id=%s", [tid])
        return Response({"status": "send_failed", "message": "Failed to send OTP. Please check mobile number and email."}, status=502)
    m = str(c["mobno"])
    return Response({"status": "otp_sent", "temp_id": tid, "mobile": "•" * (len(m) - 4) + m[-4:], "expires_in": OTP_MINUTES * 60, "resend_after": RESEND_SECONDS})


def _resend(request, desk):
    tid = str(request.data.get("temp_id", ""))
    t = one("SELECT mobno, email, TIMESTAMPDIFF(SECOND, otp_generated_at, NOW()) age, approved_by FROM patient_temp WHERE temp_id=%s AND status='OTP'", [tid])
    if not t or (desk and t["approved_by"] != request.user.permanent_id):
        return Response({"status": "not_found"}, status=404)
    if t["age"] is not None and t["age"] < RESEND_SECONDS:
        return Response({"status": "too_soon", "retry_after": RESEND_SECONDS - t["age"]}, status=429)
    otp = f"{secrets.randbelow(900000) + 100000}"
    run("UPDATE patient_temp SET otp=%s, otp_generated_at=NOW(), otp_attempts=0 WHERE temp_id=%s", [otp, tid])
    if not _deliver(tid, t["mobno"], t["email"], otp):
        return Response({"status": "send_failed"}, status=502)
    return Response({"status": "otp_sent"})


def _verify(request, desk):
    tid = str(request.data.get("temp_id", ""))
    otp = str(request.data.get("otp", "")).strip()
    with transaction.atomic():
        t = one("SELECT *, TIMESTAMPDIFF(SECOND, otp_generated_at, NOW()) age FROM patient_temp WHERE temp_id=%s AND status='OTP' FOR UPDATE", [tid])
        if not t or (desk and t["approved_by"] != request.user.permanent_id):
            return Response({"status": "not_found", "message": "Registration not found. Please start again."}, status=404)
        if (t["otp_attempts"] or 0) >= OTP_TRIES or t["age"] is None or t["age"] > OTP_MINUTES * 60:
            return Response({"status": "otp_expired", "message": "OTP expired or too many attempts. Please request a new OTP."}, status=410)
        if not hmac.compare_digest(otp, t["otp"] or ""):   # patient_temp.otp is varchar(10), like the legacy OTP columns
            run("UPDATE patient_temp SET otp_attempts=otp_attempts+1 WHERE temp_id=%s", [tid])
            return Response({"status": "otp_invalid", "attempts_left": OTP_TRIES - (t["otp_attempts"] or 0) - 1}, status=400)
        if one("SELECT permanentid FROM patient WHERE mobno=%s", [t["mobno"]]):
            return Response({"status": "invalid", "errors": {"mobno": "Mobile number already registered."}}, status=400)
        pid = new_id("PAT", "patient")
        cols = ["fname", "lname", "mname", "dob", "age", "gender", "marital", "address", "city", "state", "country", "zipcode", "mobno", "hphone",
                "emergencycontact", "email", "bloodgroup", "insurance_provider", "govtidtype", "govtidno", "govtidfile"]
        vals = [t[c] for c in cols]
        vals[cols.index("zipcode")] = t["zipcode"] or None
        vals[cols.index("emergencycontact")] = t["emergencycontact"] or None
        vals[cols.index("email")] = t["email"] or ""
        run(f"INSERT INTO patient (permanentid, pswrd, {', '.join(cols)}, otp_verified, date_time) VALUES (%s,'',{','.join(['%s'] * len(cols))},1,NOW())", [pid, *vals])
        _login_row(pid)
        run("DELETE FROM patient_temp WHERE temp_id=%s", [tid])
        token = None
        if not desk:
            token = secrets.token_urlsafe(32)
            run("INSERT INTO password_reset_otp (permanentid, role, otp_hash, otp_generated_at, otp_attempts, otp_verified, reset_token_hash, reset_token_expires_at, used) "
                "VALUES (%s,'PATIENT',%s,NOW(),0,1,%s,DATE_ADD(NOW(), INTERVAL %s MINUTE),0) ON DUPLICATE KEY UPDATE role='PATIENT', otp_hash=VALUES(otp_hash), "
                "otp_generated_at=NOW(), otp_attempts=0, otp_verified=1, reset_token_hash=VALUES(reset_token_hash), reset_token_expires_at=VALUES(reset_token_expires_at), used=0",
                [pid, sha256(secrets.token_hex(8)), sha256(token), TOKEN_MINUTES])
    name = " ".join(x for x in [t["fname"], (t["mname"] or "").strip(), t["lname"]] if x)
    lines = [f"Dear {mailer.e(name)}, your patient registration has been completed successfully.", f"Your Permanent ID: <b>{pid}</b>"]
    if desk:
        lines.append(f"<a href='{set_password_link(pid)}'>Set your password</a> to log in to the patient portal.")
    mailer.send(t["email"], f"Patient registration successful - Permanent ID: {pid}", "Welcome to Cobalt EHR", lines)
    return Response({"status": "registered", "permanentid": pid, "token": token, "message": f"Patient registered successfully. Permanent ID: {pid}"}, status=201)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def patient_start(request):
    return _start(request, False)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def patient_resend(request):
    return _resend(request, False)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def patient_verify(request):
    return _verify(request, False)


@api_view(["POST"])
@permission_classes([IsDesk])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def desk_patient_start(request):
    return _start(request, True)


@api_view(["POST"])
@permission_classes([IsDesk])
def desk_patient_resend(request):
    return _resend(request, True)


@api_view(["POST"])
@permission_classes([IsDesk])
def desk_patient_verify(request):
    return _verify(request, True)


# ====================================================================== reception directory + profile
DIR = {
    "doctor": ("permanentid, fname, mname, lname, specialization, qualification, experience, deptname, mobno, workphone, workemail, jobtype, status", "doctor"),
    "nurse": ("permanentid, fname, mname, lname, specialization, qualification, experience, deptname, mobno, workphone, workemail, jobtype", "nurse"),
    "receptionist": ("permanentid, fullname, deptname, mobno, workphone, workemail, jobtype, status", "receptionist"),
    "department": ("permanentid, deptname, deptheadname, dept_head_mobile_number, floor_wing, assigneddoctors, assignednurses, noofrooms, noofbeds", "department"),
}


@api_view(["GET"])
@permission_classes([IsDesk])
def directory(request, kind):
    """Legacy reception doctors-list / nurse-list / receptionist-list / dept-list (own hospital, read-only)."""
    if kind not in DIR:
        return Response({"status": "not_found"}, status=404)
    cols, table = DIR[kind]
    return Response({"items": rows(f"SELECT {cols} FROM {table} WHERE hospital_id=%s ORDER BY {'deptname' if kind == 'department' else 'date_time DESC'}",
                                   [reception_hospital(request)])})


@api_view(["GET"])
@permission_classes([IsDesk])
def directory_detail(request, kind, pid):
    if kind not in DIR:
        return Response({"status": "not_found"}, status=404)
    d = detail(DIR[kind][1], pid, "AND hospital_id=%s", [reception_hospital(request)])
    if not d:
        return Response({"status": "not_found"}, status=404)
    for k in ("govtidno", "has_govtidfile", "has_mcifile", "dob", "marital", "address"):
        d.pop(k, None)                       # front desk sees work details, not personal documents
    if kind == "doctor":
        from hospital.views import _default_slots
        d["slots"] = _default_slots(pid)
    return Response({"item": d})


@api_view(["GET"])
@permission_classes([IsReceptionist])
def reception_profile(request):
    """Legacy reception/profile.html."""
    return Response({"profile": detail("receptionist", request.user.permanent_id)})


@api_view(["GET"])
@permission_classes([IsReceptionist])
def reception_govtid(request):
    return file_response(blob("receptionist", request.user.permanent_id, "govtidfile"), f"{request.user.permanent_id}_govtid")
