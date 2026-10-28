"""OTP delivery: WhatsApp (same provider payload as the Java app) + email."""
import json
import logging
import re
import urllib.request

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

log = logging.getLogger(__name__)


def _fmt_phone(phone: str) -> str:
    p = re.sub(r"\D", "", str(phone or ""))
    if p.startswith("0"):
        return "91" + p[1:]
    if not p.startswith("91") and len(p) == 10:
        return "91" + p
    return p


def send_whatsapp_otp(mobile: str, otp: str) -> bool:
    if not (settings.WHATSAPP_API_URL and settings.WHATSAPP_API_KEY):
        return False
    payload = {
        "apiKey": settings.WHATSAPP_API_KEY,
        "campaignName": settings.WHATSAPP_CAMPAIGN,
        "destination": _fmt_phone(mobile),
        "userName": settings.WHATSAPP_USERNAME,
        "templateParams": [otp],
        "buttons": [{"type": "button", "sub_type": "url", "index": 0, "parameters": [{"type": "text", "text": otp}]}],
    }
    req = urllib.request.Request(
        settings.WHATSAPP_API_URL, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except Exception:
        log.exception("WhatsApp OTP failed")
        return False


def send_email_otp(email: str, otp: str) -> bool:
    if not (settings.EMAIL_HOST and email):
        return False
    html = (
        "<div style='font-family:sans-serif;max-width:480px;margin:auto'>"
        "<h3>Welcome to Cobalt EHR</h3><p>Your sign-in OTP is:</p>"
        f"<p style='font-size:32px;letter-spacing:6px;font-weight:700;color:#2f5bff'>{otp}</p>"
        f"<p>Valid for {settings.OTP_VALID_MINUTES} minutes. Do not share it with anyone.</p></div>"
    )
    try:
        msg = EmailMultiAlternatives("Your Cobalt EHR OTP", f"Your OTP is {otp}", settings.DEFAULT_FROM_EMAIL, [email])
        msg.attach_alternative(html, "text/html")
        msg.send()
        return True
    except Exception:
        log.exception("Email OTP failed")
        return False


def deliver_otp(pid: str, mobile: str, email: str, otp: str) -> bool:
    if settings.DEV_ECHO_OTP:
        print(f"\n[DEV_ECHO_OTP] OTP for {pid}: {otp}\n", flush=True)
        return True
    wa = send_whatsapp_otp(mobile, otp)
    em = send_email_otp(email, otp) if email and email.upper() != "NA" else False
    return wa or em
