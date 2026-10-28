"""Create / reschedule appointments with the same safety rules as Java
bookAppointmentForPatient(): MySQL named lock + duplicate check per doctor/date/time."""
import random
import zlib
from contextlib import contextmanager

from accounts.db import one, run
from django.db import connection

from . import slots

OPEN_TYPES = ("consult", "consult-rescheduled", "followup", "followup-rescheduled", "referral", "referral-rescheduled")
# Java kept the origin of a rescheduled visit in the type: consult-rescheduled / followup-rescheduled / referral-rescheduled
RESCHEDULED_TYPE = {"consult": "consult-rescheduled", "consult-rescheduled": "consult-rescheduled",
                    "followup": "followup-rescheduled", "followup-rescheduled": "followup-rescheduled",
                    "referral": "referral-rescheduled", "referral-rescheduled": "referral-rescheduled"}


@contextmanager
def slot_lock(doctor_id, date_s, time_s):
    name = "cobalt_appt_%x" % (zlib.crc32(f"{doctor_id}|{date_s}|{time_s}".encode()) & 0xFFFFFFFF)
    with connection.cursor() as c:
        c.execute("SELECT GET_LOCK(%s, 5)", [name])
        got = c.fetchone()[0] == 1
    try:
        yield got
    finally:
        if got:
            with connection.cursor() as c:
                c.execute("SELECT RELEASE_LOCK(%s)", [name])


def _new_id():
    while True:
        cand = "APNT" + "".join(random.choice("0123456789") for _ in range(5))
        if not one("SELECT 1 x FROM appointment WHERE appointmentid=%s", [cand]):
            return cand


def doctor_row(doctor_id):
    return one("SELECT d.permanentid, d.fname, d.mname, d.lname, d.deptname, d.hospital_id, d.hospital_name, h.city "
               "FROM doctor d LEFT JOIN hospital h ON h.permanentid=d.hospital_id WHERE d.permanentid=%s", [doctor_id])


def subject_row(patient_id):
    """Patient or child (children live in child_reg and use the parent's e-mail when empty)."""
    if (patient_id or "").upper().startswith("CHILD"):
        c = one("SELECT childfname AS fname, mname, lname, email, parent_id FROM child_reg WHERE child_id=%s", [patient_id])
        if c and not c.get("email"):
            c["email"] = (one("SELECT email FROM patient WHERE permanentid=%s", [c["parent_id"]]) or {}).get("email") or ""
        return c
    return one("SELECT fname, mname, lname, email FROM patient WHERE permanentid=%s", [patient_id])


def create(patient_id, doctor_id, date_s, time_s, symptoms="", appt_type="consult"):
    """Returns (ok, code, appointment_id)."""
    if appt_type not in ("consult", "followup", "referral"):
        return False, "invalid_type", None
    doc = doctor_row(doctor_id)
    pat = subject_row(patient_id)
    if not doc or not pat:
        return False, "not_found", None
    symptoms = (symptoms or "").strip()[:600]
    with slot_lock(doctor_id, date_s, time_s) as got:
        if not got:
            return False, "busy", None
        if not slots.is_slot_free(doctor_id, date_s, time_s):
            return False, "slot_unavailable", None
        clash = one("SELECT 1 x FROM appointment WHERE permanentid=%s AND date_of_booking=%s AND time_of_booking=%s "
                    "AND LOWER(COALESCE(appointment_type,'')) NOT IN %s", [patient_id, date_s, time_s, slots.FREE_TYPES_EXCLUDED])
        if clash:
            return False, "patient_conflict", None
        apid = _new_id()
        fullname = " ".join(x for x in (pat["fname"], (pat["mname"] or "").strip(), pat["lname"]) if x)[:45]
        doc_name = " ".join(x for x in (doc["fname"], doc["lname"]) if x)
        run("INSERT INTO appointment (appointmentid, permanentid, fullname, doctorid, email, city, hospital_name, hospital_id, "
            "deptname, doctor_name, date_of_booking, time_of_booking, appointment_type, symptoms_list) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            [apid, patient_id, fullname, doctor_id, (pat["email"] or "")[:45], doc["city"] or "", doc["hospital_name"], doc["hospital_id"],
             doc["deptname"], doc_name[:40], date_s, time_s, appt_type, symptoms])
        return True, "booked", apid


def reschedule(appt, date_s, time_s, by):
    """appt = appointment row dict. Returns (ok, code)."""
    if appt["appointment_type"] not in OPEN_TYPES:
        return False, "not_reschedulable"
    if appt["date_of_booking"] == date_s and (appt["time_of_booking"] or "").strip() == time_s.strip():
        return False, "same_slot"
    doctor_id = appt["doctorid"]
    with slot_lock(doctor_id, date_s, time_s) as got:
        if not got:
            return False, "busy"
        if not slots.is_slot_free(doctor_id, date_s, time_s, ignore_appointment=appt["appointmentid"]):
            return False, "slot_unavailable"
        clash = one("SELECT 1 x FROM appointment WHERE permanentid=%s AND date_of_booking=%s AND time_of_booking=%s "
                    "AND appointmentid<>%s AND LOWER(COALESCE(appointment_type,'')) NOT IN %s",
                    [appt["permanentid"], date_s, time_s, appt["appointmentid"], slots.FREE_TYPES_EXCLUDED])
        if clash:
            return False, "patient_conflict"
        # Same update as Java updateRescheduleAppointmentDetails()
        new_type = RESCHEDULED_TYPE.get(appt["appointment_type"], "consult-rescheduled")
        run("UPDATE appointment SET date_of_booking=%s, time_of_booking=%s, rescheduled_by=%s, appointment_type=%s "
            "WHERE appointmentid=%s", [date_s, time_s, by, new_type, appt["appointmentid"]])
        return True, "rescheduled"


CLOSED_TYPES = ("completed", "cancelled", "dns", "referral_appointment")


def cancel(appt, reason, by):
    """Same update as Java patientCancelAppointment(); `by` = PATIENT / DOCTOR / RECEPTION."""
    if appt["appointment_type"] in CLOSED_TYPES:
        return False
    run("UPDATE appointment SET pat_cancel_reason=%s, cancelled_by=%s, patient_status='cancelled', appointment_type='cancelled' "
        "WHERE appointmentid=%s", [reason, by, appt["appointmentid"]])
    return True
