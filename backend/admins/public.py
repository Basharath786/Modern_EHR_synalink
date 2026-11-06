"""Phase 6: public website data, registration status / correction for temporary patients, and the
super admin integrations screen.

Legacy:
  index.html (home page counters), doctors-list.html (listAllDoctors), hospitals-list.html
  (listApprovedHospitalsSummery), labs-list.html (listApprovedLabsSummery), pharmacy-list.html
  (listApprovedPharmaciesSummery) - only public, approved data is returned (no mobile numbers, IDs of
  documents or personal details).
  profile-status.html / profile-update.html (sendingVerificationCodeToPatient, checkVerificationCodeOfPatient,
  updateValidPatientInfo): a registration put on HOLD can re-upload the Govt ID after confirming a code sent
  to the registered e-mail (at most 3 uploads, patient_temp.patient_upload_attempt)."""
import hmac
import secrets

from django.conf import settings
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import mailer, whatsapp
from accounts.authn import IsSuperAdmin
from accounts.db import one, rows, run
from accounts.entities import file_field
from accounts.setpw import mask_email, sha256

APPROVED = "approved_by IS NOT NULL AND approved_by<>''"


# ====================================================================== public website
@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def stats(request):
    n = lambda sql: one(sql)["n"]
    return Response({
        "hospitals": n(f"SELECT COUNT(*) n FROM hospital WHERE {APPROVED}"),
        "doctors": n("SELECT COUNT(*) n FROM doctor WHERE status='APPROVED'"),
        "labs": n(f"SELECT COUNT(*) n FROM lab WHERE {APPROVED}"),
        "pharmacies": n(f"SELECT COUNT(*) n FROM pharmacy WHERE {APPROVED}"),
        "patients": n("SELECT COUNT(*) n FROM patient"),
    })


DIRECTORY = {
    "doctors": ("SELECT d.permanentid, CONCAT_WS(' ', d.fname, d.lname) AS name, d.specialization, d.qualification, d.experience, d.deptname, "
                "d.hospital_name, h.city, h.state, h.address FROM doctor d JOIN hospital h ON h.permanentid=d.hospital_id "
                f"WHERE d.status='APPROVED' AND h.{APPROVED} ORDER BY d.fname"),
    "hospitals": ("SELECT permanentid, hospital_name AS name, type, category, address, city, state, zipcode, land_phone, hospital_email AS email, "
                  f"specialities_list, size AS beds, blood_bank FROM hospital WHERE permanentid IS NOT NULL AND {APPROVED} ORDER BY hospital_name"),
    "labs": ("SELECT permanentid, labname AS name, category, address, city, state, zipcode, land_phone, labemail AS email, specialities_list "
             f"FROM lab WHERE permanentid IS NOT NULL AND {APPROVED} ORDER BY labname"),
    "pharmacies": ("SELECT permanentid, pharmacy_name AS name, category, address, city, state, zipcode, land_phone, pharmacy_email AS email "
                   f"FROM pharmacy WHERE permanentid IS NOT NULL AND {APPROVED} ORDER BY pharmacy_name"),
}


@api_view(["GET"])
@authentication_classes([])
@permission_classes([])
def directory(request, kind):
    if kind not in DIRECTORY:
        return Response({"status": "not_found"}, status=404)
    return Response({"items": rows(DIRECTORY[kind])})


# ====================================================================== registration status (profile-status / profile-update)
CODE_MINUTES, CODE_TRIES, MAX_UPLOADS = 10, 3, 3


def _status_of(ident):
    ident = ident.strip()
    if ident.upper().startswith("PAT"):
        p = one("SELECT permanentid, fname, lname, approved_by FROM patient WHERE permanentid=%s", [ident.upper()])
        if not p:
            return None
        return {"kind": "permanent", "id": p["permanentid"], "name": f"{p['fname']} {p['lname']}",
                "status": "VALIDATED" if (p["approved_by"] or "").strip() else "PENDING"}
    t = one("SELECT temp_id, fname, lname, email, status, hold_attempt, patient_upload_attempt FROM patient_temp WHERE temp_id=%s AND COALESCE(status,'')<>'OTP'", [ident])
    if not t:
        return None
    h = one("SELECT reason_for_hold FROM temp_user_hold_info WHERE temp_id=%s", [ident]) or {}
    st = (t["status"] or "PENDING").upper()
    return {"kind": "temporary", "id": t["temp_id"], "name": f"{t['fname']} {t['lname'] or ''}".strip(), "status": st,
            "hold_reason": h.get("reason_for_hold"), "holds": t["hold_attempt"] or 0, "uploads": t["patient_upload_attempt"] or 0,
            "uploads_left": max(MAX_UPLOADS - (t["patient_upload_attempt"] or 0), 0), "email": mask_email(t["email"]),
            "can_update": st == "HOLD" and (t["patient_upload_attempt"] or 0) < MAX_UPLOADS and bool(t["email"])}


def _centers():
    """'Please reach out to one of the validation centres below' (approved hospitals)."""
    return rows(f"SELECT hospital_name AS name, address, city, state, land_phone FROM hospital WHERE permanentid IS NOT NULL AND {APPROVED} ORDER BY city, hospital_name")


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def reg_status(request):
    s = _status_of(str(request.data.get("id", "")))
    if not s:
        return Response({"status": "not_found", "message": "No registration found with this ID."}, status=404)
    return Response({"status": "ok", "registration": s, "centers": _centers() if s["status"] != "VALIDATED" else []})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def reg_send_code(request):
    """Legacy sendingVerificationCodeToPatient (code to the registered e-mail)."""
    s = _status_of(str(request.data.get("id", "")))
    if not s or s["kind"] != "temporary" or not s["can_update"]:
        return Response({"status": "not_allowed", "message": "Only registrations on hold can be updated."}, status=403)
    t = one("SELECT email FROM patient_temp WHERE temp_id=%s", [s["id"]])
    code = f"{secrets.randbelow(900000) + 100000}"
    run("INSERT INTO password_reset_otp (permanentid, role, otp_hash, otp_generated_at, otp_attempts, otp_verified, reset_token_hash, reset_token_expires_at, used) "
        "VALUES (%s,'TEMP_PATIENT',%s,NOW(),0,0,NULL,NULL,0) ON DUPLICATE KEY UPDATE role='TEMP_PATIENT', otp_hash=VALUES(otp_hash), otp_generated_at=NOW(), "
        "otp_attempts=0, otp_verified=0, reset_token_hash=NULL, reset_token_expires_at=NULL, used=0", [s["id"], sha256(code)])
    if settings.DEV_ECHO_OTP:
        print(f"\n[DEV_ECHO_OTP] registration update code for {s['id']}: {code}\n", flush=True)
    mailer.send(t["email"], "Cobalt EHR - verification code", f"Dear {s['name']},", [
        f"Your verification code is <b style='font-size:22px;letter-spacing:4px'>{code}</b>", f"It is valid for {CODE_MINUTES} minutes."])
    return Response({"status": "code_sent", "email": s["email"]})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def reg_verify(request):
    """Legacy checkVerificationCodeOfPatient -> matched / not matched / expired / invalid attempts."""
    tid = str(request.data.get("id", "")).strip()
    code = str(request.data.get("code", "")).strip()
    with transaction.atomic():
        r = one("SELECT id, otp_hash, otp_attempts, TIMESTAMPDIFF(SECOND, otp_generated_at, NOW()) age FROM password_reset_otp "
                "WHERE permanentid=%s AND role='TEMP_PATIENT' AND used=0 FOR UPDATE", [tid])
        if not r or r["age"] is None or r["age"] > CODE_MINUTES * 60:
            return Response({"status": "expired"}, status=410)
        if (r["otp_attempts"] or 0) >= CODE_TRIES:
            return Response({"status": "invalid attempts"}, status=429)
        if not hmac.compare_digest(sha256(code), r["otp_hash"] or ""):
            run("UPDATE password_reset_otp SET otp_attempts=otp_attempts+1 WHERE id=%s", [r["id"]])
            return Response({"status": "not matched", "attempts_left": CODE_TRIES - (r["otp_attempts"] or 0) - 1}, status=400)
        token = secrets.token_urlsafe(24)
        run("UPDATE password_reset_otp SET otp_verified=1, reset_token_hash=%s, reset_token_expires_at=DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id=%s",
            [sha256(token), r["id"]])
    return Response({"status": "matched", "token": token})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
@parser_classes([MultiPartParser, FormParser])
def reg_update(request):
    """Legacy updateValidPatientInfo: new Govt ID number + proof; status goes back to PENDING for validation."""
    tid = str(request.data.get("id", "")).strip()
    token = str(request.data.get("token", ""))
    govtidno = str(request.data.get("govtidno", "")).strip()
    import re
    if not re.fullmatch(r"[2-9]\d{11}", govtidno):
        return Response({"status": "invalid", "errors": {"govtidno": "Aadhaar number must be 12 digits and cannot start with 0 or 1"}}, status=400)
    data, err = file_field(request, "govtidfile", "ID proof")
    if err:
        return Response({"status": "invalid", "errors": {"govtidfile": err}}, status=400)
    with transaction.atomic():
        r = one("SELECT id, reset_token_hash, reset_token_expires_at > NOW() AS valid FROM password_reset_otp WHERE permanentid=%s AND role='TEMP_PATIENT' "
                "AND used=0 AND otp_verified=1 FOR UPDATE", [tid])
        if not r or not r["valid"] or not hmac.compare_digest(sha256(token), r["reset_token_hash"] or ""):
            return Response({"status": "token_expired", "message": "Please verify the code again."}, status=410)
        t = one("SELECT temp_id, fname, email, approved_by, status, patient_upload_attempt FROM patient_temp WHERE temp_id=%s FOR UPDATE", [tid])
        if not t or (t["status"] or "").upper() != "HOLD" or (t["patient_upload_attempt"] or 0) >= MAX_UPLOADS:
            return Response({"status": "not_allowed"}, status=403)
        n = (t["patient_upload_attempt"] or 0) + 1
        run("UPDATE patient_temp SET govtidno=%s, govtidfile=%s, patient_upload_attempt=%s, status='PENDING' WHERE temp_id=%s", [govtidno, data, n, tid])
        run("UPDATE temp_user_hold_info SET status='UPDATED' WHERE temp_id=%s", [tid])
        run("UPDATE password_reset_otp SET used=1 WHERE id=%s", [r["id"]])
    mailer.send(t["email"], "Your registration details were updated", f"Dear {t['fname']},", [
        "Your new ID details were received and are waiting for validation.", f"Uploads used: {n} of {MAX_UPLOADS}."])
    # tell whoever put it on hold (legacy notifyPatientForValidRecordUpdate / notify validator)
    holder = t["approved_by"] or ""
    to = mailer.hospital_email(holder) if holder.startswith("HOS") else (one("SELECT workemail e FROM receptionist WHERE permanentid=%s", [holder]) or {}).get("e")
    mailer.send(to, "Held registration updated", "Held registration updated", [f"Temporary registration <b>{tid}</b> ({mailer.e(t['fname'])}) uploaded new ID details. Please review it."])
    return Response({"status": "updated", "uploads_left": MAX_UPLOADS - n})


# ====================================================================== integrations (super admin)
@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def integrations(request):
    mask = lambda v: (v[:3] + "•••" + v[-2:]) if v and len(v) > 6 else ("•••" if v else "")
    return Response({
        "email": {"configured": bool(settings.EMAIL_HOST), "host": settings.EMAIL_HOST, "port": settings.EMAIL_PORT, "tls": settings.EMAIL_USE_TLS,
                  "user": mask(settings.EMAIL_HOST_USER), "from": settings.DEFAULT_FROM_EMAIL},
        "whatsapp": {"configured": whatsapp.configured(), "url": settings.WHATSAPP_API_URL, "key": mask(settings.WHATSAPP_API_KEY),
                     "otp_campaign": settings.WHATSAPP_CAMPAIGN, "id_campaign": settings.WHATSAPP_ID_CAMPAIGN, "expired_campaign": settings.WHATSAPP_EXPIRED_CAMPAIGN},
        "app": {"frontend_url": settings.FRONTEND_URL, "debug": settings.DEBUG, "dev_echo_otp": settings.DEV_ECHO_OTP,
                "dev_skip_patient_otp": getattr(settings, "DEV_SKIP_PATIENT_OTP", False), "super_admin_id": settings.SUPER_ADMIN_ID},
    })


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def integrations_test(request):
    """Send a test e-mail or WhatsApp message (synchronously, so the result is reported)."""
    channel = str(request.data.get("channel", ""))
    to = str(request.data.get("to", "")).strip()
    if channel == "email":
        if not settings.EMAIL_HOST:
            return Response({"status": "not_configured"}, status=400)
        try:
            from django.core.mail import send_mail
            send_mail("Cobalt EHR test e-mail", "SMTP is configured correctly.", settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
            return Response({"status": "sent"})
        except Exception as e:
            return Response({"status": "failed", "message": str(e)[:300]}, status=502)
    if channel == "whatsapp":
        if not whatsapp.configured():
            return Response({"status": "not_configured"}, status=400)
        ok = whatsapp.send_now(settings.WHATSAPP_ID_CAMPAIGN, to, ["Cobalt test", "TEST00000"])
        return Response({"status": "sent" if ok else "failed"}, status=200 if ok else 502)
    return Response({"status": "invalid"}, status=400)
