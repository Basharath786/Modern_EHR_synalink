"""Doctor slot availability. Ported from Java DoctorSlot.viewAllSlots():
default weekly slots for the next 16 days, then active_slots overrides
(status 'add' adds slots, 'cancel' removes them). Booked slots are marked."""
import re
from datetime import date, datetime, timedelta

from accounts.db import rows

HORIZON_DAYS = 15                       # today + 15 = 16 days, same as Java findDates()
FREE_TYPES_EXCLUDED = ("cancelled", "canceled", "cancel", "dns", "completed")   # these do not block a slot


def _start_time(slot: str):
    try:
        return datetime.strptime(slot.split("-")[0].strip(), "%I:%M %p").time()
    except ValueError:
        return None


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def _slot_cols(row):
    return [row[k] for k in sorted((k for k in row if k.startswith("slot")), key=lambda k: int(k[4:])) if row[k]]


def slot_map(doctor_id: str) -> dict:
    today = date.today()
    dates = [today + timedelta(days=i) for i in range(HORIZON_DAYS + 1)]
    smap: dict[str, list] = {}
    for r in rows("SELECT * FROM default_dr_slot WHERE doctorid=%s", [doctor_id]):
        day = (r["day"] or "").strip().lower()
        slots = []
        for s in _slot_cols(r):
            if _norm(s) not in [_norm(x) for x in slots]:
                slots.append(s.strip())
        for d in dates:
            if d.strftime("%A").lower() == day:
                smap.setdefault(d.isoformat(), slots)
    for r in rows("SELECT * FROM active_slots WHERE doctorid=%s AND available_date >= %s", [doctor_id, today]):
        key = r["available_date"].isoformat()
        active = _slot_cols(r)
        status = (r["status"] or "").lower()
        if status == "add":
            cur = smap.setdefault(key, [])
            for s in active:
                if _norm(s) not in [_norm(x) for x in cur]:
                    cur.append(s.strip())
        elif status == "cancel" and key in smap:
            smap[key] = [x for x in smap[key] if _norm(x) not in {_norm(a) for a in active}]
    return smap


def booked_set(doctor_id: str, start: date, end: date, ignore_appointment: str = "") -> set:
    r = rows("SELECT date_of_booking d, time_of_booking t FROM appointment WHERE doctorid=%s AND date_of_booking BETWEEN %s AND %s "
             "AND LOWER(COALESCE(appointment_type,'')) NOT IN %s AND appointmentid<>%s",
             [doctor_id, start.isoformat(), end.isoformat(), FREE_TYPES_EXCLUDED, ignore_appointment])
    return {(x["d"], _norm(x["t"])) for x in r}


def available(doctor_id: str, include_booked: bool = False, ignore_appointment: str = "") -> list:
    today = date.today()
    smap = slot_map(doctor_id)
    if not smap:
        return []
    booked = booked_set(doctor_id, today, max(date.fromisoformat(k) for k in smap), ignore_appointment)
    now = datetime.now().time()
    out = []
    for key in sorted(smap):
        d = date.fromisoformat(key)
        items = []
        for s in sorted(smap[key], key=lambda x: _start_time(x) or datetime.max.time()):
            st = _start_time(s)
            if d == today and st and st <= now:          # slot already started today
                continue
            is_booked = (key, _norm(s)) in booked
            if is_booked and not include_booked:
                continue
            items.append({"time": s, "booked": is_booked})
        if items:
            out.append({"date": key, "weekday": d.strftime("%A"), "slots": items})
    return out


def is_slot_free(doctor_id: str, date_s: str, time_s: str, ignore_appointment: str = "") -> bool:
    for day in available(doctor_id, ignore_appointment=ignore_appointment):
        if day["date"] == date_s:
            return any(_norm(s["time"]) == _norm(time_s) for s in day["slots"])
    return False
