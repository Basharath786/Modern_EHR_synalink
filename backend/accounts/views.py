from django.conf import settings
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response

from . import mailer, services
from .authn import IsAuthenticatedUser, make_token
from .roles import ROLE_PORTAL, ROLE_TABLES, detect_role

FAIL_STATUS = {
    "id_error": "id_error",
    "password_error": "password_error",
    "locked_account": "locked_account",
    "password_expired_non_patient": "password_expired",
}


def _user_payload(pid, role, last_login=None):
    if role == "SUPER_ADMIN":
        return {"permanentid": pid, "role": role, "portal": "super-admin", "name": "Super Admin",
                "last_login": last_login.isoformat() if last_login else None}
    p = services.profile(pid, role)
    out = {
        "permanentid": pid, "role": role, "portal": ROLE_PORTAL[role],
        "name": p["name"], "last_login": last_login.isoformat() if last_login else None,
    }
    if role == "PATIENT":
        from patient.access import is_validated
        out["validated"] = is_validated(pid)
    if role in ("PATIENT", "DOCTOR"):
        from accounts.db import one
        g = one(f"SELECT gender FROM {'patient' if role == 'PATIENT' else 'doctor'} WHERE permanentid=%s", [pid]) or {}
        out["gender"] = g.get("gender")
    return out


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def login_view(request):
    pid = str(request.data.get("permanentid", "")).strip().upper()
    password = str(request.data.get("password", ""))
    if not pid or not password:
        return Response({"status": "missing_fields"}, status=400)

    role = detect_role(pid)
    if role is None or role not in ROLE_TABLES:
        return Response({"status": "id_error"}, status=401)

    from .setpw import has_password
    if services._one("SELECT permanentid FROM login WHERE permanentid=%s", [pid]) and not has_password(pid):
        # created with an empty password (legacy register/approve) -> must use "Set password" first
        return Response({"status": "password_not_set", "permanentid": pid}, status=401)
    if role == "ADMIN":                                      # legacy adminLogin: checkAdminStatus first
        st = (services._one("SELECT status FROM internal_admin WHERE permanentid=%s", [pid]) or {}).get("status")
        if st is None:
            return Response({"status": "id_error"}, status=401)
        if str(st).upper() != "ACTIVE":
            return Response({"status": "account_inactive"}, status=401)

    result = services.authenticate(pid, password, role)
    if result == "password_error":                         # legacy allUserLoginStatus: "Login attempts remaining : N"
        failed = (services._one("SELECT failed_attempt FROM login WHERE permanentid=%s", [pid]) or {}).get("failed_attempt") or 0
        left = max(services.MAX_FAILED_BEFORE_RESET - failed, 0)
        return Response({"status": "locked_account" if left == 0 else "password_error", "attempts_left": left}, status=401)
    if result == "password_expired_non_patient":
        _expired_notice(pid, role)
    if result in FAIL_STATUS:
        return Response({"status": FAIL_STATUS[result]}, status=401)

    if (result or "").upper() == "YES":                     # system-generated password
        if not services.is_default_password_valid(pid, role):
            return Response({"status": "temp_password_expired"}, status=401)
        services.login_time(pid)
        # limited token: can ONLY be used to set a new password
        token = make_token(pid, role, scope="change_password", minutes=15)
        return Response({"status": "temp_password", "token": token, "user": _user_payload(pid, role)})

    if (result or "").upper() == "NO":
        if not services.is_user_password_valid(pid, role):
            _expired_notice(pid, role)
            return Response({"status": "password_expired"}, status=401)
        if role == "PATIENT" and not settings.DEV_SKIP_PATIENT_OTP:
            # Password OK -> patient must now verify the OTP (see patient/otp.py)
            token = make_token(pid, role, scope="otp", minutes=15)
            return Response({"status": "otp_required", "token": token, "user": {"permanentid": pid, "role": role, "name": services.profile(pid, role)["name"]}})
        last = services.login_time(pid)
        return Response({"status": "success", "token": make_token(pid, role), "user": _user_payload(pid, role, last)})

    return Response({"status": "id_error"}, status=401)


@api_view(["POST"])
@permission_classes([IsAuthenticatedUser])
def change_password_view(request):
    cur = str(request.data.get("current_password", ""))
    new = str(request.data.get("new_password", ""))
    confirm = str(request.data.get("confirm_password", ""))
    if request.user.role not in ROLE_TABLES:
        return Response({"status": "forbidden"}, status=403)
    if new != confirm:
        return Response({"status": "mismatch"}, status=400)
    ok, err = services.change_password(request.user.permanent_id, request.user.role, cur, new)
    if not ok:
        return Response({"status": err}, status=400)
    from .setpw import account
    _, acc = account(request.user.permanent_id)
    mailer.send((acc or {}).get("email"), "Your Cobalt EHR password was changed", "Password changed", [
        f"The password for <b>{mailer.e(request.user.permanent_id)}</b> was changed.", "If this was not you, reset it from the sign-in page and contact your admin."])
    return Response({"status": "password_changed"})


def _expired_notice(pid, role):
    """Legacy LoginImpl: WhatsApp 'password_expired_all_portals' (+ e-mail) when an expired password is used.
    Sent at most once a day per account so repeated attempts don't spam the user."""
    from django.core.cache import cache

    from . import whatsapp
    from .setpw import account, set_password_link
    if not cache.add(f"pwexp:{pid}", 1, 86_400):
        return
    _, acc = account(pid)
    if not acc:
        return
    whatsapp.password_expired(acc.get("mobile"), pid)
    mailer.send(acc.get("email"), "Your Cobalt EHR password has expired", "Password expired", [
        f"The password for <b>{mailer.e(pid)}</b> has expired.", f"<a href='{set_password_link(pid)}'>Reset your password</a> to continue."])


@api_view(["GET"])
def me_view(request):
    if request.user.scope != "full":
        return Response({"status": "forbidden"}, status=403)
    return Response({"user": _user_payload(request.user.permanent_id, request.user.role)})
