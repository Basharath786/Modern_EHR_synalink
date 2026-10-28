"""Doctor portal: referrals (Java appointments.js referral tabs), active-slot management
(Java update-active-slots.html / slots.js), doctor profile (doctor-details.html) and the
patient profile / history files (patient-profile.html, history-files.js)."""
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from django.db import transaction
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsDoctor
from accounts.db import one, rows, run
from booking import slots as slot_engine
from patient.files import file_response, strip_multipart
from .views import COLS
from .visit import can_view_patient, patient_profile

CATALOG = json.loads((Path(__file__).resolve().parent.parent / "booking" / "data" / "slot_catalog.json").read_text())
MAX_ACTIVE = 20          # active_slots has slot1..slot20


# ======================= referrals =======================
REF_SQL = ("SELECT r.*, CONCAT_WS(' ', p.fname, p.lname) AS patient_name, CONCAT_WS(' ', c.childfname, c.lname) AS child_name, "
           "CONCAT_WS(' ', d1.fname, d1.lname) AS referrer_doc_name, h1.hospital_name AS referrer_hospital_name, "
           "CONCAT_WS(' ', d2.fname, d2.lname) AS referred_doc_name, d2.deptname AS referred_dept, h2.hospital_name AS referred_hospital_name, "
           "a.date_of_booking, a.time_of_booking, a.symptoms_list "
           "FROM referral_appointment r LEFT JOIN patient p ON p.permanentid=r.patient_id LEFT JOIN child_reg c ON c.child_id=r.patient_id "
           "LEFT JOIN doctor d1 ON d1.permanentid=r.referrer_doc_id LEFT JOIN hospital h1 ON h1.permanentid=r.referrer_hospital_id "
           "LEFT JOIN doctor d2 ON d2.permanentid=r.referred_doc_id LEFT JOIN hospital h2 ON h2.permanentid=r.referred_hospital_id "
           "LEFT JOIN appointment a ON a.appointmentid=r.apnt_id ")


def referral_rows(where, args):
    out = rows(REF_SQL + where + " ORDER BY r.date_time DESC", args)
    for r in out:
        r["patient_name"] = r.pop("child_name") if (r["patient_id"] or "").upper().startswith("CHILD") else r["patient_name"]
        r.pop("child_name", None)
    return out


@api_view(["GET"])
@permission_classes([IsDoctor])
def referrals(request):
    """Java listReferredDoctorDetails (incoming) + listReferrerDoctorDetails (outgoing)."""
    me = request.user.permanent_id
    return Response({
        "incoming": referral_rows("WHERE r.referred_doc_id=%s", [me]),
        "outgoing": referral_rows("WHERE r.referrer_doc_id=%s", [me]),
        "booked": rows(f"SELECT {COLS} FROM appointment WHERE doctorid=%s AND appointment_type IN ('referral','referral-rescheduled') "
                       "ORDER BY date_of_booking DESC", [me]),
    })


def _incoming(request, apnt_id):
    return one("SELECT * FROM referral_appointment WHERE apnt_id=%s AND referred_doc_id=%s", [apnt_id, request.user.permanent_id])


@api_view(["POST"])
@permission_classes([IsDoctor])
def accept_referral(request, apnt_id):
    """Java doctorAcceptReferralAppointment: referred_doc_status='accepted' (after the patient accepted)."""
    r = _incoming(request, apnt_id)
    if not r:
        return Response({"status": "not_found"}, status=404)
    if r["patient_status"] != "accepted" or r["referred_doc_status"] != "pending":
        return Response({"status": "not_pending", "patient_status": r["patient_status"], "doctor_status": r["referred_doc_status"]}, status=409)
    run("UPDATE referral_appointment SET referred_doc_status='accepted' WHERE apnt_id=%s", [apnt_id])
    d = one("SELECT fname, lname FROM doctor WHERE permanentid=%s", [request.user.permanent_id]) or {}
    mailer.send(mailer.patient_email(r["patient_id"]), "Referral accepted", "Referral accepted",
                [f"Dr. {mailer.e(d.get('fname'))} {mailer.e(d.get('lname'))} ({request.user.permanent_id}) has accepted your referral appointment request.",
                 f"You can now book a new appointment with Dr. {mailer.e(d.get('fname'))} {mailer.e(d.get('lname'))} from the patient portal.",
                 f"Referral ID: {apnt_id}"])
    return Response({"status": "accepted"})


@api_view(["POST"])
@permission_classes([IsDoctor])
def decline_referral(request, apnt_id):
    """Java doctorCancelReferralAppointment (reason stored in referred_doc_cancel_reason, varchar 200)."""
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 200:
        return Response({"status": "reason_too_long", "max": 200}, status=400)
    r = _incoming(request, apnt_id)
    if not r:
        return Response({"status": "not_found"}, status=404)
    if r["referred_doc_status"] == "cancelled":
        return Response({"status": "already_cancelled"}, status=409)
    run("UPDATE referral_appointment SET referred_doc_cancel_reason=%s, referred_doc_status='cancelled' WHERE apnt_id=%s", [reason, apnt_id])
    d = one("SELECT fname, lname FROM doctor WHERE permanentid=%s", [request.user.permanent_id]) or {}
    lines = [f"Dr. {mailer.e(d.get('fname'))} {mailer.e(d.get('lname'))} has cancelled the referral appointment {apnt_id}.", f"Reason: {mailer.e(reason)}"]
    mailer.send(mailer.patient_email(r["patient_id"]), "Referral cancelled by doctor", "Referral cancelled", lines)
    mailer.send(mailer.doctor_email(r["referrer_doc_id"]), "Referred doctor cancelled the referral", "Referral cancelled",
                lines + [f"Patient ID: {r['patient_id']}"])
    return Response({"status": "cancelled"})


@api_view(["GET"])
@permission_classes([IsDoctor])
def referral_targets(request):
    """Hospitals in the doctor's city -> departments -> doctors (Java referral modal)."""
    me = one("SELECT d.hospital_id, h.city FROM doctor d LEFT JOIN hospital h ON h.permanentid=d.hospital_id WHERE d.permanentid=%s",
             [request.user.permanent_id]) or {}
    hid = request.GET.get("hospital_id", "").strip()
    out = {"city": me.get("city"),
           "hospitals": rows("SELECT permanentid AS id, hospital_name AS name, address, city FROM hospital WHERE UPPER(city)=UPPER(%s) "
                             "AND permanentid<>'' ORDER BY hospital_name", [me.get("city") or ""])}
    if hid:
        depts = {r["d"] for r in rows("SELECT deptname d FROM department WHERE hospital_id=%s UNION SELECT deptname d FROM doctor WHERE hospital_id=%s",
                                      [hid, hid]) if r["d"]}
        out["departments"] = sorted(depts)
        out["doctors"] = rows("SELECT permanentid AS id, CONCAT_WS(' ', fname, lname) AS name, deptname, specialization FROM doctor "
                              "WHERE hospital_id=%s AND permanentid<>%s ORDER BY fname", [hid, request.user.permanent_id])
    return Response(out)


# ======================= active slot management =======================
def _slot_cols(r):
    return [r[f"slot{i}"] for i in range(1, 51) if f"slot{i}" in r and r[f"slot{i}"]]


def _minutes(t):
    try:
        x = datetime.strptime(t.strip(), "%I:%M %p")
        return x.hour * 60 + x.minute
    except ValueError:
        return 0


def _range(s):
    p = s.split("-")
    a = _minutes(p[0])
    return a, (_minutes(p[1]) if len(p) > 1 else a)


def _overlap(a, b):
    x, y = _range(a), _range(b)
    return x[0] < y[1] and y[0] < x[1]


def _sorted(items):
    return sorted(items, key=lambda s: _range(s))


def _norm(s):
    return " ".join((s or "").split()).lower()


def _best_catalog(defaults):
    best, count = None, 0
    for key in ("first_slots", "second_slots", "third_slots"):
        n = len([s for s in defaults if s in CATALOG[key]])
        if n > count:
            best, count = key, n
    return best


def _date_param(request, key="date"):
    try:
        d = date.fromisoformat(str((request.GET if request.method == "GET" else request.data).get(key, "")).strip())
    except ValueError:
        return None, Response({"status": "invalid_date"}, status=400)
    today = date.today()
    if not (today <= d <= today + timedelta(days=15)):          # Java datepickers: minDate 0, maxDate +15D
        return None, Response({"status": "date_out_of_range", "min": today.isoformat(), "max": (today + timedelta(days=15)).isoformat()}, status=400)
    return d, None


def _past_today(d, slot):
    if d != date.today():
        return False
    now = datetime.now()
    return _range(slot)[0] <= now.hour * 60 + now.minute


def _date_state(doctor_id, d):
    day = d.strftime("%A").lower()
    defaults = []
    for drow in rows("SELECT * FROM default_dr_slot WHERE doctorid=%s AND LOWER(TRIM(day))=%s", [doctor_id, day]):
        for s in _slot_cols(drow):
            if _norm(s) not in [_norm(x) for x in defaults]:
                defaults.append(s.strip())
    arow = one("SELECT * FROM active_slots WHERE doctorid=%s AND available_date=%s", [doctor_id, d])
    active = _slot_cols(arow) if arow else []
    booked = slot_engine.booked_set(doctor_id, d, d)
    key = _best_catalog(defaults)
    catalog = CATALOG[key] if key else []
    mark = lambda lst: [{"time": s, "past": _past_today(d, s), "booked": (d.isoformat(), _norm(s)) in booked} for s in _sorted(lst)]
    create, add = [], []
    if defaults and not arow:
        create = [s for s in catalog if _norm(s) not in {_norm(x) for x in defaults}]
    if arow:
        add = [s for s in catalog if not any(_overlap(s, x) for x in active) and _norm(s) not in {_norm(x) for x in defaults}]
    return {
        "date": d.isoformat(), "weekday": d.strftime("%A"), "default_slots": mark(defaults),
        "active": {"status": arow["status"], "slots": mark(active)} if arow else None,
        "create_options": mark(create), "add_options": mark(add), "remove_options": mark(active),
        "free_columns": MAX_ACTIVE - len(active), "catalog": key,
        "effective": [s for day in slot_engine.available(doctor_id, include_booked=True) if day["date"] == d.isoformat() for s in day["slots"]],
    }


@api_view(["GET"])
@permission_classes([IsDoctor])
def slot_date(request):
    d, err = _date_param(request)
    if err:
        return err
    return Response(_date_state(request.user.permanent_id, d))


@api_view(["GET"])
@permission_classes([IsDoctor])
def default_slots(request):
    """Java viewDoctorDefaultSlots for all weekdays."""
    byday = {}
    for r in rows("SELECT * FROM default_dr_slot WHERE doctorid=%s", [request.user.permanent_id]):
        cur = byday.setdefault((r["day"] or "").strip().capitalize(), [])
        for s in _slot_cols(r):
            if _norm(s) not in [_norm(x) for x in cur]:
                cur.append(s.strip())
    out = [{"day": k, "slots": _sorted(v)} for k, v in byday.items()]
    order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    out.sort(key=lambda x: order.index(x["day"]) if x["day"] in order else 9)
    upcoming = rows("SELECT available_date, status FROM active_slots WHERE doctorid=%s AND available_date>=CURDATE() ORDER BY available_date",
                    [request.user.permanent_id])
    for u in upcoming:
        u["slots"] = _slot_cols(one("SELECT * FROM active_slots WHERE doctorid=%s AND available_date=%s", [request.user.permanent_id, u["available_date"]]) or {})
    return Response({"defaults": out, "active_dates": upcoming})


def _pick(request, allowed, d):
    chosen = request.data.get("slots")
    if not isinstance(chosen, list) or not chosen:
        return None, Response({"status": "select_slots"}, status=400)
    allowed_n = {_norm(s["time"]): s for s in allowed}
    clean = []
    for c in chosen:
        hit = allowed_n.get(_norm(str(c)))
        if not hit or hit["past"]:
            return None, Response({"status": "slot_not_allowed", "slot": c}, status=400)
        if hit["time"] not in clean:
            clean.append(hit["time"])
    return clean, None


def _notify_hospital(doctor_id, subject, lines):
    d = one("SELECT d.fname, d.lname, d.deptname, d.hospital_id FROM doctor d WHERE permanentid=%s", [doctor_id]) or {}
    head = [f"Doctor: <b>Dr. {mailer.e(d.get('fname'))} {mailer.e(d.get('lname'))} ({doctor_id})</b>", f"Department: {mailer.e(d.get('deptname'))}"]
    mailer.send(mailer.hospital_email(d.get("hospital_id")), subject, subject, head + lines)
    mailer.send(mailer.doctor_email(doctor_id), subject, subject, head + lines)


@api_view(["POST"])
@permission_classes([IsDoctor])
def create_slots(request):
    """Java createActiveDoctorSlot: new active_slots row (status 'add') for a date without one."""
    d, err = _date_param(request)
    if err:
        return err
    me = request.user.permanent_id
    st = _date_state(me, d)
    if st["active"]:
        return Response({"status": "date_has_slots"}, status=409)
    if not st["default_slots"]:
        return Response({"status": "no_default_slots"}, status=409)
    clean, err = _pick(request, st["create_options"], d)
    if err:
        return err
    if len(clean) > MAX_ACTIVE:
        return Response({"status": "too_many", "max": MAX_ACTIVE}, status=400)
    vals = clean + [None] * (MAX_ACTIVE - len(clean))
    run("INSERT INTO active_slots (doctorid, available_date, " + ", ".join(f"slot{i}" for i in range(1, 21)) + ", status) VALUES (%s,%s," +
        ",".join(["%s"] * 20) + ",'add')", [me, d, *vals])
    _notify_hospital(me, "Active slots created", [f"Date: <b>{d}</b>", f"Added slots: <b>{', '.join(clean)}</b>"])
    return Response({"status": "created", **_date_state(me, d)}, status=201)


@api_view(["POST"])
@permission_classes([IsDoctor])
def add_slots(request):
    """Java rescheduleActiveSlot status 'add': fill empty slotN columns of the date's row."""
    d, err = _date_param(request)
    if err:
        return err
    me = request.user.permanent_id
    st = _date_state(me, d)
    if not st["active"]:
        return Response({"status": "create_first"}, status=409)
    clean, err = _pick(request, st["add_options"], d)
    if err:
        return err
    with transaction.atomic():
        row = one("SELECT * FROM active_slots WHERE doctorid=%s AND available_date=%s FOR UPDATE", [me, d])
        empty = [f"slot{i}" for i in range(1, 21) if not row.get(f"slot{i}")]
        if len(clean) > len(empty):
            return Response({"status": "too_many", "free": len(empty)}, status=400)
        for col, s in zip(empty, clean):
            run(f"UPDATE active_slots SET {col}=%s WHERE doctorid=%s AND available_date=%s", [s, me, d])
    _notify_hospital(me, "Active slots updated", [f"Date: <b>{d}</b>", f"Added slots: <b>{', '.join(clean)}</b>"])
    return Response({"status": "added", **_date_state(me, d)})


@api_view(["POST"])
@permission_classes([IsDoctor])
def remove_slots(request):
    """Java rescheduleActiveSlot status 'cancel' (NULL the matching columns); removing every slot
    deletes the row like Java deleteEntireSlotsForDate. Booked slots cannot be removed."""
    d, err = _date_param(request)
    if err:
        return err
    me = request.user.permanent_id
    st = _date_state(me, d)
    if not st["active"]:
        return Response({"status": "no_active_slots"}, status=404)
    clean, err = _pick(request, [dict(s, past=False) for s in st["remove_options"]], d)
    if err:
        return err
    booked = [s["time"] for s in st["remove_options"] if s["booked"] and s["time"] in clean]
    if booked:
        return Response({"status": "slot_booked", "slots": booked}, status=409)
    if len(clean) == len(st["remove_options"]):
        run("DELETE FROM active_slots WHERE doctorid=%s AND available_date=%s", [me, d])
    else:
        row = one("SELECT * FROM active_slots WHERE doctorid=%s AND available_date=%s", [me, d])
        for i in range(1, 21):
            if row.get(f"slot{i}") and _norm(row[f"slot{i}"]) in {_norm(c) for c in clean}:
                run(f"UPDATE active_slots SET slot{i}=NULL WHERE doctorid=%s AND available_date=%s", [me, d])
    _notify_hospital(me, "Active slots removed", [f"Date: <b>{d}</b>", f"Removed slots: <b>{', '.join(clean)}</b>"])
    return Response({"status": "removed", **_date_state(me, d)})


@api_view(["POST"])
@permission_classes([IsDoctor])
def clear_slots(request):
    """Java deleteEntireSlotsForDate."""
    d, err = _date_param(request)
    if err:
        return err
    me = request.user.permanent_id
    st = _date_state(me, d)
    if not st["active"]:
        return Response({"status": "no_active_slots"}, status=404)
    booked = [s["time"] for s in st["remove_options"] if s["booked"]]
    if booked:
        return Response({"status": "slot_booked", "slots": booked}, status=409)
    run("DELETE FROM active_slots WHERE doctorid=%s AND available_date=%s", [me, d])
    _notify_hospital(me, "All active slots removed", [f"Date: <b>{d}</b>"])
    return Response({"status": "cleared", **_date_state(me, d)})


# ======================= doctor profile =======================
@api_view(["GET"])
@permission_classes([IsDoctor])
def profile(request):
    """Java doctor-details.html (listAllDetails DOCTOR)."""
    d = one("SELECT d.permanentid, d.fname, d.mname, d.lname, d.dob, d.age, d.gender, d.marital, d.address, d.city, d.state, d.country, "
            "d.zipcode, d.mobno, d.workphone, d.workemail, d.altemail, d.emergencycontact, d.bloodgroup, d.jobtype, d.hospital_name, d.hospital_id, "
            "d.specialization, d.qualification, d.experience, d.pastworked, d.deptname, d.mciregno, d.govtidtype, d.govtidno, d.status, d.date_time, "
            "(d.mcifile IS NOT NULL AND LENGTH(d.mcifile)>0) AS has_mci_file, (d.govtidfile IS NOT NULL AND LENGTH(d.govtidfile)>0) AS has_govtid_file, "
            "h.address AS hospital_address, h.city AS hospital_city, h.land_phone AS hospital_phone, h.hospital_email "
            "FROM doctor d LEFT JOIN hospital h ON h.permanentid=d.hospital_id WHERE d.permanentid=%s", [request.user.permanent_id])
    return Response({"profile": d})


@api_view(["GET"])
@permission_classes([IsDoctor])
def profile_file(request, kind):
    col = {"mci": "mcifile", "govtid": "govtidfile"}.get(kind)
    if not col:
        return Response({"status": "not_found"}, status=404)
    r = one(f"SELECT {col} f FROM doctor WHERE permanentid=%s", [request.user.permanent_id])
    return file_response((r or {}).get("f"), f"{kind}-document")


# ======================= patient profile (history files) =======================
@api_view(["GET"])
@permission_classes([IsDoctor])
def patient_files(request, patient_id):
    """Java patient-profile.html + history-files.js: profile, problems/allergies/flags with status,
    patient-added allergies, medicines and lab tests per order, vaccinations, past reports, case files."""
    me = request.user.permanent_id
    if not can_view_patient(me, patient_id):
        return Response({"status": "forbidden"}, status=403)
    meds = rows("SELECT o.apnt_id, o.order_id, o.pharmacy_name, o.confirmation_status, o.medicine_name, o.medicine_quantity, o.medicine_duration, "
                "o.medicine_usage, o.medicine_instructions, o.repeat_medicine, o.date_time, "
                "(DATEDIFF(o.date_time, CURDATE()) + CAST(o.medicine_duration AS UNSIGNED)) AS days_left "
                "FROM pharmacy_orders o WHERE o.patient_id=%s ORDER BY o.date_time DESC", [patient_id])
    labs = rows("SELECT apnt_id, order_id, labname, status, lab_test_name, repeat_test, emergency_test, lab_cancel_reason, date_time, "
                "(report_file IS NOT NULL) AS has_report FROM lab_order WHERE patient_id=%s ORDER BY date_time DESC", [patient_id])
    return Response({
        "profile": patient_profile(patient_id),
        "visits": rows(f"SELECT {COLS} FROM appointment WHERE doctorid=%s AND permanentid=%s ORDER BY date_time DESC", [me, patient_id]),
        "all_visits": rows(f"SELECT {COLS} FROM appointment WHERE permanentid=%s ORDER BY date_time DESC", [patient_id]),
        "problems": rows("SELECT apnt_id, pat_problems, status, date_time FROM patient_problems WHERE patient_id=%s ORDER BY date_time DESC", [patient_id]),
        "flags": rows("SELECT apnt_id, pat_flags, status, date_time FROM patient_flags WHERE patient_id=%s ORDER BY date_time DESC", [patient_id]),
        "allergies": rows("SELECT apnt_id, allergy_name, allergies_severity, allergies_description, status, date_time FROM patient_allergies "
                          "WHERE patient_id=%s ORDER BY date_time DESC", [patient_id]),
        "patient_allergies": rows("SELECT allergy_name, allergies_severity, allergies_description, status, date_time FROM patient_add_allergies "
                                  "WHERE patient_id=%s ORDER BY date_time DESC", [patient_id]),
        "medications": meds, "lab_orders": labs,
        "vaccinations": rows("SELECT vaccine_name, dose_no, vaccination_date, date, (vaccination_file IS NOT NULL) AS has_file "
                             "FROM patient_vaccination WHERE patient_id=%s ORDER BY date DESC", [patient_id]),
        "past_reports": rows("SELECT file_name, date FROM patient_past_report WHERE patient_id=%s ORDER BY date DESC", [patient_id]),
        "case_files": rows("SELECT r.apnt_id, r.apnt_details, r.case_status, r.diagnosis, r.date_time, a.doctor_name, a.deptname, a.hospital_name "
                           "FROM patient_reportfile_data r JOIN appointment a ON a.appointmentid=r.apnt_id WHERE r.patient_id=%s ORDER BY r.date_time DESC",
                           [patient_id]),
    })


@api_view(["GET"])
@permission_classes([IsDoctor])
def patient_file_download(request, patient_id, kind):
    """Past report / vaccination certificate / lab report of a patient the doctor treats."""
    if not can_view_patient(request.user.permanent_id, patient_id):
        return Response({"status": "forbidden"}, status=403)
    g = request.GET
    if kind == "past-report":
        r = one("SELECT past_reportfile f FROM patient_past_report WHERE patient_id=%s AND file_name=%s LIMIT 1", [patient_id, g.get("name", "")])
        return file_response(strip_multipart((r or {}).get("f")), g.get("name", "report"))
    if kind == "vaccination":
        r = one("SELECT vaccination_file f FROM patient_vaccination WHERE patient_id=%s AND vaccine_name=%s AND dose_no=%s AND vaccination_file IS NOT NULL LIMIT 1",
                [patient_id, g.get("vaccine_name", ""), g.get("dose_no", "")])
        return file_response((r or {}).get("f"), "vaccination")
    if kind == "lab-report":
        r = one("SELECT report_file f FROM lab_order WHERE patient_id=%s AND order_id=%s AND report_file IS NOT NULL LIMIT 1",
                [patient_id, g.get("order_id", "0")])
        return file_response((r or {}).get("f"), "lab-report")
    return Response({"status": "not_found"}, status=404)
