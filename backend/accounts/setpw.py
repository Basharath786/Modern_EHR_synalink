"""First-time "set password" and "forgot password" for every role.

Legacy behaviour (CobaltService v1/register, v1/approve, v1/validate, v1/setPassword,
v1/forgotPasswordAllUsers, v1/verifyForgotPasswordOtp):
  * hospitals, doctors, receptionists, labs, pharmacies and their staff are created with an EMPTY
    password (login.pswrd = '', isdefault_password = 'YES');
  * after approval they get a mail "Set Password & Login" pointing to changepasssowrdallportal.html;
  * that page called v1/setPassword with only the Permanent ID - anybody who knew an ID could take
    the account over.

Here the same flow is protected the way the legacy forgot-password flow already was:
  1. POST auth/set-password/request  {permanentid}            -> 6-digit OTP to the registered e-mail /
                                                                 WhatsApp (stored as SHA-256 in
                                                                 password_reset_otp, 5 minutes, 3 tries)
  2. POST auth/set-password/verify   {permanentid, otp}       -> one-time reset token (15 minutes)
  3. POST auth/set-password/complete {permanentid, token, new_password, confirm_password}
The account must be approved first (same rule the legacy forgot-password used)."""
import hashlib
import hmac
import logging
import secrets

from django.conf import settings
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from . import mailer
from .crypto import encrypt_password
from .db import one, run
from .roles import ROLE_TABLES, detect_role
from .services import PASSWORD_POLICY

log = logging.getLogger("cobalt.setpw")

OTP_MINUTES = 5            # legacy: TIMESTAMPDIFF(MINUTE, otp_generated_at, NOW()) > 5
OTP_MAX_ATTEMPTS = 3
TOKEN_MINUTES = 15         # legacy: reset_token_expires_at = NOW() + 15 MINUTE
RESEND_SECONDS = 30

# role -> (mobile column, e-mail column, approval rule)
CONTACT = {
    "HOSPITAL": ("administration_no", "hospital_email", "approved_by"),
    "LAB": ("administration_no", "labemail", "approved_by"),
    "PHARMACY": ("administration_no", "pharmacy_email", "approved_by"),
    "DOCTOR": ("mobno", "workemail", "status"),
    "RECEPTIONIST": ("mobno", "workemail", "status"),
    "LAB_STAFF": ("mobno", "email", "status"),
    "PHARMACY_STAFF": ("mobno", "email", "status"),
    "NURSE": ("mobno", "workemail", None),
    "ADMIN": ("mobno", "workemail", "admin_status"),
    "PATIENT": ("mobno", "email", None),
}

WHO_APPROVES = {"HOSPITAL": "the Cobalt internal admin", "LAB": "the Cobalt internal admin", "PHARMACY": "the Cobalt internal admin",
                "DOCTOR": "your hospital admin", "RECEPTIONIST": "your hospital admin", "LAB_STAFF": "your laboratory admin",
                "PHARMACY_STAFF": "your pharmacy admin", "ADMIN": "the super admin"}


def sha256(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def mask_email(e):
    e = (e or "").strip()
    if "@" not in e:
        return ""
    name, dom = e.split("@", 1)
    return (name[:2] + "•" * max(len(name) - 2, 1)) + "@" + dom


def mask_mobile(m):
    d = "".join(ch for ch in str(m or "") if ch.isdigit())
    return ("•" * max(len(d) - 4, 0) + d[-4:]) if d else ""


def has_password(pid) -> bool:
    r = one("SELECT pswrd FROM login WHERE permanentid=%s", [pid])
    return bool(r and (r.get("pswrd") or "").strip())


def account(pid):
    """(role, row with mobile/email/approved flag) or (None, None)."""
    role = detect_role(pid)
    if role not in CONTACT:
        return None, None
    table = ROLE_TABLES[role][0]
    mob, mail, rule = CONTACT[role]
    extra = ""
    if rule in ("approved_by", "status"):
        extra = f", {rule} AS approval"
    elif rule == "admin_status":
        extra = ", status AS approval"
    r = one(f"SELECT permanentid, {mob} AS mobile, {mail} AS email{extra} FROM {table} WHERE permanentid=%s", [pid])
    if not r:
        return role, None
    if rule == "approved_by":
        r["approved"] = bool((r.get("approval") or "").strip()) and (r.get("approval") or "").strip().lower() != "null"
    elif rule == "status":
        r["approved"] = (r.get("approval") or "").strip().upper() == "APPROVED"
    elif rule == "admin_status":
        r["approved"] = (r.get("approval") or "").strip().upper() == "ACTIVE"
    else:
        r["approved"] = True
    return role, r


def set_password_link(pid):
    return f"{settings.FRONTEND_URL.rstrip('/')}/set-password?id={pid}"


def approval_mail(pid, role_label, email, approver_text="approved"):
    """Mail sent after approval (legacy: 'Registration Approved - Set Your Password')."""
    link = set_password_link(pid)
    mailer.send(email, f"{role_label} registration approved - set your password", "Registration approved", [
        f"Congratulations! Your {mailer.e(role_label)} registration has been <b>{mailer.e(approver_text)}</b>.",
        f"Your Permanent ID is: <b>{mailer.e(pid)}</b>",
        "Open the link below, confirm the one-time code we send you and choose your password:",
        f"<a href='{link}' style='background:#2f5bff;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none'>Set Password &amp; Login</a>",
    ])


def _send_code(pid, mobile, email, otp, first_time):
    title = "Set your Cobalt EHR password" if first_time else "Reset your Cobalt EHR password"
    if settings.DEV_ECHO_OTP:
        print(f"\n[DEV_ECHO_OTP] set-password code for {pid}: {otp}\n", flush=True)
        return True
    sent = False
    if email and "@" in str(email):
        mailer.send(email, f"{title} - {pid}", title, [
            "Your one-time code is:",
            f"<span style='font-size:28px;letter-spacing:6px;font-weight:700;color:#2f5bff'>{otp}</span>",
            f"It is valid for {OTP_MINUTES} minutes. If you did not ask for this, ignore this mail."])
        sent = bool(settings.EMAIL_HOST)
    try:
        from patient.notify import send_whatsapp_otp
        sent = send_whatsapp_otp(str(mobile or ""), otp) or sent
    except Exception:
        log.exception("whatsapp set-password code failed")
    return sent


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def request_code(request):
    pid = str(request.data.get("permanentid", "")).strip().upper()
    if not pid:
        return Response({"status": "missing_fields"}, status=400)
    role, acc = account(pid)
    if not acc:
        return Response({"status": "id_error"}, status=404)
    if not acc["approved"]:
        return Response({"status": "not_approved", "message": f"Your account is not approved yet. Please wait for {WHO_APPROVES.get(role, 'approval')}."},
                        status=403)
    first_time = not has_password(pid)
    mobile = str(acc.get("mobile") or "").strip()
    email = str(acc.get("email") or "").strip()
    if mobile.upper() == "NA":
        mobile = ""
    if email.upper() == "NA":
        email = ""
    if not mobile and not email:
        return Response({"status": "no_contact", "message": "No mobile number or e-mail is registered for this account. Please contact your admin."}, status=400)
    last = one("SELECT TIMESTAMPDIFF(SECOND, otp_generated_at, NOW()) age FROM password_reset_otp WHERE permanentid=%s AND used=0", [pid])
    if last and last["age"] is not None and 0 <= last["age"] < RESEND_SECONDS:
        return Response({"status": "too_soon", "retry_after": RESEND_SECONDS - last["age"]}, status=429)
    otp = f"{secrets.randbelow(1_000_000):06d}"
    run("INSERT INTO password_reset_otp (permanentid, role, otp_hash, otp_generated_at, otp_attempts, otp_verified, reset_token_hash, "
        "reset_token_expires_at, used) VALUES (%s,%s,%s,NOW(),0,0,NULL,NULL,0) ON DUPLICATE KEY UPDATE role=VALUES(role), "
        "otp_hash=VALUES(otp_hash), otp_generated_at=NOW(), otp_attempts=0, otp_verified=0, reset_token_hash=NULL, "
        "reset_token_expires_at=NULL, used=0", [pid, role, sha256(otp)])
    if not _send_code(pid, mobile, email, otp, first_time):
        return Response({"status": "send_failed", "message": "Could not send the code. Please try again later."}, status=502)
    return Response({"status": "code_sent", "first_time": first_time, "email": mask_email(email), "mobile": mask_mobile(mobile),
                     "expires_in": OTP_MINUTES * 60, "resend_after": RESEND_SECONDS})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def verify_code(request):
    pid = str(request.data.get("permanentid", "")).strip().upper()
    otp = str(request.data.get("otp", "")).strip()
    if not pid or not otp:
        return Response({"status": "missing_fields"}, status=400)
    with transaction.atomic():
        r = one("SELECT id, otp_hash, otp_attempts, otp_verified, TIMESTAMPDIFF(SECOND, otp_generated_at, NOW()) age "
                "FROM password_reset_otp WHERE permanentid=%s AND used=0 FOR UPDATE", [pid])
        if not r or r["otp_verified"] or r["age"] is None or r["age"] > OTP_MINUTES * 60 or (r["otp_attempts"] or 0) >= OTP_MAX_ATTEMPTS:
            return Response({"status": "otp_expired", "message": "Code expired or too many attempts. Please request a new code."}, status=410)
        if not hmac.compare_digest(sha256(otp), r["otp_hash"] or ""):
            run("UPDATE password_reset_otp SET otp_attempts=otp_attempts+1 WHERE id=%s", [r["id"]])
            left = OTP_MAX_ATTEMPTS - (r["otp_attempts"] or 0) - 1
            return Response({"status": "otp_invalid", "attempts_left": max(left, 0)}, status=400)
        token = secrets.token_urlsafe(32)
        run("UPDATE password_reset_otp SET otp_verified=1, reset_token_hash=%s, reset_token_expires_at=DATE_ADD(NOW(), INTERVAL %s MINUTE) "
            "WHERE id=%s", [sha256(token), TOKEN_MINUTES, r["id"]])
    return Response({"status": "verified", "token": token, "expires_in": TOKEN_MINUTES * 60})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def complete(request):
    pid = str(request.data.get("permanentid", "")).strip().upper()
    token = str(request.data.get("token", ""))
    new = str(request.data.get("new_password", ""))
    confirm = str(request.data.get("confirm_password", ""))
    if not (pid and token and new):
        return Response({"status": "missing_fields"}, status=400)
    if new != confirm:
        return Response({"status": "mismatch"}, status=400)
    if not PASSWORD_POLICY.match(new):
        return Response({"status": "weak_password"}, status=400)
    role, acc = account(pid)
    if not acc or not acc["approved"]:
        return Response({"status": "id_error"}, status=404)
    with transaction.atomic():
        r = one("SELECT id, reset_token_hash, reset_token_expires_at > NOW() AS valid FROM password_reset_otp "
                "WHERE permanentid=%s AND used=0 AND otp_verified=1 FOR UPDATE", [pid])
        if not r or not r["valid"] or not hmac.compare_digest(sha256(token), r["reset_token_hash"] or ""):
            return Response({"status": "token_expired", "message": "This link has expired. Please start again."}, status=410)
        enc = encrypt_password(new)
        table = ROLE_TABLES[role][0]
        run(f"UPDATE {table} SET pswrd=%s WHERE permanentid=%s", [enc, pid])
        if one("SELECT permanentid FROM login WHERE permanentid=%s", [pid]):
            run("UPDATE login SET pswrd=%s, isdefault_password='NO', pswrd_changed_time=NOW(), failed_attempt=0, account_locked='NO', "
                "lock_time=0 WHERE permanentid=%s", [enc, pid])
        else:
            run("INSERT INTO login (permanentid, pswrd, isdefault_password, systemLoginTime, pswrd_changed_time, failed_attempt, "
                "account_locked, lock_time) VALUES (%s,%s,'NO',NOW(),NOW(),0,'NO',0)", [pid, enc])
        run("UPDATE password_reset_otp SET used=1 WHERE id=%s", [r["id"]])
    mailer.send(acc.get("email"), "Your Cobalt EHR password was set", "Password updated",
                [f"The password for <b>{mailer.e(pid)}</b> was set successfully.", "If this was not you, contact your admin immediately."])
    return Response({"status": "password_set"})
