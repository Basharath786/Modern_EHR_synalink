"""WhatsApp notifications through the same provider and campaigns as the Java app
(PatientOTPUtil: AiSensy campaign API).

  Create_user_idss              -> "<name>, your Cobalt Permanent ID is <ID>" after hospital, lab, pharmacy,
                                   doctor, receptionist, lab staff and pharmacy staff registration
  password_expired_all_portals  -> "<ID>: your password has expired" when a login hits an expired password
OTP messages stay in patient/notify.py. Everything here is best-effort and runs in a background thread."""
import json
import logging
import threading
import urllib.request

from django.conf import settings

from patient.notify import _fmt_phone

log = logging.getLogger("cobalt.whatsapp")


def configured() -> bool:
    return bool(settings.WHATSAPP_API_URL and settings.WHATSAPP_API_KEY)


def send_now(campaign: str, mobile, params, buttons=None) -> bool:
    phone = _fmt_phone(mobile)
    if not configured() or len(phone) < 10:
        log.info("[whatsapp skipped] %s -> %s", campaign, phone)
        return False
    payload = {"apiKey": settings.WHATSAPP_API_KEY, "campaignName": campaign, "destination": phone,
               "userName": settings.WHATSAPP_USERNAME, "templateParams": [str(p) for p in params], "buttons": buttons or []}
    req = urllib.request.Request(settings.WHATSAPP_API_URL, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except Exception:
        log.exception("WhatsApp %s failed", campaign)
        return False


def send(campaign, mobile, params, buttons=None):
    threading.Thread(target=send_now, args=(campaign, mobile, params, buttons), daemon=True).start()


def new_permanent_id(mobile, name, pid):
    """Legacy send{Hospital,Lab,Pharmacy,Doctor,Receptionist,LabStaff,PharmacyStaff}PermanentIdViaWhatsApp."""
    send(settings.WHATSAPP_ID_CAMPAIGN, mobile, [name or pid, pid])


def password_expired(mobile, pid):
    send(settings.WHATSAPP_EXPIRED_CAMPAIGN, mobile, [pid])
