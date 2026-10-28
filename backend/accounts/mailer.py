"""Best-effort e-mail notifications (the Java app mailed patients, doctors and hospitals
after bookings, cancellations, referrals, orders and slot changes).

Nothing here may break the main request: if SMTP is not configured or sending fails,
the message is only logged. Set EMAIL_HOST / EMAIL_HOST_USER / EMAIL_HOST_PASSWORD in .env."""
import html
import logging
import threading

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from .db import one

log = logging.getLogger("cobalt.mail")


def _wrap(title, lines):
    body = "".join(f"<p style='margin:6px 0'>{l}</p>" for l in lines)
    return (
        "<div style='font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:10px'>"
        "<div style='background:#2f5bff;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:700'>Cobalt EHR</div>"
        f"<div style='padding:16px 18px;color:#1f2937'><h3 style='margin-top:0'>{html.escape(title)}</h3>{body}"
        "<p style='color:#6b7280;margin-top:18px'>Regards,<br>Cobalt EHR Team</p></div></div>"
    )


def _send(to, subject, title, lines):
    to = [t for t in (to if isinstance(to, (list, tuple)) else [to]) if t and "@" in str(t)]
    if not to:
        return
    if not settings.EMAIL_HOST:
        log.info("[mail skipped - EMAIL_HOST not set] %s -> %s", subject, to)
        return
    try:
        msg = EmailMultiAlternatives(subject, "\n".join(html.unescape(l) for l in lines), settings.DEFAULT_FROM_EMAIL, to)
        msg.attach_alternative(_wrap(title, lines), "text/html")
        msg.send(fail_silently=False)
    except Exception:  # never break the API call because of mail
        log.exception("mail failed: %s", subject)


def send(to, subject, title, lines):
    """Send in a background thread so the API answers immediately."""
    threading.Thread(target=_send, args=(to, subject, title, [str(l) for l in lines]), daemon=True).start()


def e(v):
    return html.escape(str(v if v is not None else ""))


# ---------- address lookups ----------
def patient_email(pid):
    pid = pid or ""
    if pid.upper().startswith("CHILD"):
        c = one("SELECT email, parent_id FROM child_reg WHERE child_id=%s", [pid]) or {}
        if c.get("email"):
            return c["email"]
        pid = c.get("parent_id") or ""
    return (one("SELECT email FROM patient WHERE permanentid=%s", [pid]) or {}).get("email")


def doctor_email(did):
    return (one("SELECT workemail FROM doctor WHERE permanentid=%s", [did]) or {}).get("workemail")


def hospital_email(hid):
    return (one("SELECT hospital_email FROM hospital WHERE permanentid=%s", [hid]) or {}).get("hospital_email")


def pharmacy_email(pid):
    return (one("SELECT pharmacy_email FROM pharmacy WHERE permanentid=%s", [pid]) or {}).get("pharmacy_email")


def lab_email(lid):
    return (one("SELECT labemail FROM lab WHERE permanentid=%s", [lid]) or {}).get("labemail")
