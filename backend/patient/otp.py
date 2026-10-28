"""Patient login OTP. Ported from PatientOTPUtil / resendPatientOtp / verifyLoginOtp.
Difference: OTP state is looked up by permanentid (Java used the mobile number, which
breaks when two patients share a number)."""
import secrets

from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import services
from accounts.authn import IsOtpScope, make_token
from accounts.views import _user_payload

from .db import one, run
from .notify import deliver_otp


def _mask(mobile):
    m = "".join(ch for ch in (mobile or "") if ch.isdigit())
    return ("•" * max(len(m) - 4, 0) + m[-4:]) if m else ""


@api_view(["POST"])
@permission_classes([IsOtpScope])
def send_otp(request):
    pid = request.user.permanent_id
    pat = one("SELECT mobno, email, otp_generated_at, "
              "TIMESTAMPDIFF(SECOND, otp_generated_at, NOW()) AS age FROM patient WHERE permanentid=%s", [pid])
    if not pat:
        return Response({"status": "patient_not_found"}, status=404)
    mobile = str(pat["mobno"] or "").strip()
    if not mobile or mobile.upper() == "NA":
        return Response({"status": "mobile_required"}, status=400)
    if pat["age"] is not None and 0 <= pat["age"] < settings.OTP_RESEND_SECONDS:
        return Response({"status": "too_soon", "retry_after": settings.OTP_RESEND_SECONDS - pat["age"]}, status=429)

    otp = str(secrets.randbelow(900000) + 100000)
    run("UPDATE patient SET otp=%s, otp_generated_at=NOW(), otp_verified=0, otp_attempts=0 WHERE permanentid=%s", [otp, pid])
    if not deliver_otp(pid, mobile, pat["email"], otp):
        return Response({"status": "send_failed"}, status=502)
    return Response({"status": "otp_sent", "mobile": _mask(mobile), "expires_in": settings.OTP_VALID_MINUTES * 60,
                     "resend_after": settings.OTP_RESEND_SECONDS})


@api_view(["POST"])
@permission_classes([IsOtpScope])
def verify_otp(request):
    pid = request.user.permanent_id
    code = str(request.data.get("otp", "")).strip()
    if not code.isdigit() or len(code) != 6:
        return Response({"status": "otp_invalid", "message": "Enter the 6-digit code."}, status=400)

    run("UPDATE patient SET otp_attempts = COALESCE(otp_attempts,0) + 1 WHERE permanentid=%s", [pid])
    row = one("SELECT otp_attempts FROM patient WHERE permanentid=%s", [pid])
    attempts = (row or {}).get("otp_attempts") or 0
    if attempts > settings.OTP_MAX_ATTEMPTS:
        return Response({"status": "max_attempts"}, status=429)

    ok = one("SELECT permanentid FROM patient WHERE permanentid=%s AND otp=%s AND otp_verified=0 "
             "AND otp_generated_at >= DATE_SUB(NOW(), INTERVAL %s MINUTE)", [pid, code, settings.OTP_VALID_MINUTES])
    if not ok:
        return Response({"status": "otp_invalid", "attempts_left": max(settings.OTP_MAX_ATTEMPTS - attempts, 0)}, status=400)

    run("UPDATE patient SET otp_verified=1, otp_attempts=0 WHERE permanentid=%s", [pid])
    # Same as Java verifyLoginOtp: a verified OTP login refreshes pswrd_changed_time
    run("UPDATE login SET pswrd_changed_time=NOW() WHERE permanentid=%s", [pid])
    last = services.login_time(pid)
    return Response({"status": "success", "token": make_token(pid, "PATIENT"), "user": _user_payload(pid, "PATIENT", last)})
