"""Doctor patient examination (Java treatment/patient-visit.html).

Tabs: Vitals, Subjective (symptoms + 3D model), System Review, Assessment (flags, problems,
allergies, past history), Plan (medicines, lab tests, loadouts, drug interactions) and Final
(send orders, provisional diagnosis, diagnosis, appointment status).

"Send Reports" = Java sendPatientReportData (patient_reportfile_data) + patientReportFile
(patient_problems / patient_flags / patient_allergies) + updateAppointmentStatus, plus the
referral (sendReferralAppointment) or follow-up booking chosen as the appointment status.
The string formats written to patient_reportfile_data are the same as the Java UI produced,
so old and new case files render the same way."""
import json
import re
from datetime import date

from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsDoctor
from accounts.db import one, rows, run
from booking import service
from .views import COLS, OPEN

WRITABLE = OPEN + ("completed",)
STATUSES = ("completed", "referral-request", "followup")
HISTORY_TEXT = ("family_history", "self_medical_history", "drug_history", "social_history")
HISTORY_JSON = ("personal_history", "smoking_history", "surgical_history", "alcohol_history", "substance_use_history",
                "obstetric_history", "menstrual_gyn_history", "sexual_history", "psychiatric_history")
VITALS = [  # key, label, unit, validator
    ("temperature", "Temperature", "F", lambda v: 94 <= float(v) <= 109),
    ("respiratory_rate", "Respiratory Rate", "/min", lambda v: 0 <= float(v) <= 40),
    ("pulse_rate", "Pulse Rate", "/min", lambda v: 0 <= float(v) <= 220),
    ("height", "Height", "Feet", lambda v: re.fullmatch(r"[0-9]'[0-9]{1,2}", v) is not None),
    ("weight", "Weight", "Kg", lambda v: 0.5 <= float(v) <= 442),
    ("blood_pressure", "Blood Pressure", "mm/hg", lambda v: re.fullmatch(r"\d{2,3}/\d{2,3}", v) is not None),
    ("spo2", "SpO2", "%", lambda v: 0 <= float(v) <= 100),
]


def _appt(request, appointment_id):
    return one(f"SELECT {COLS} FROM appointment WHERE appointmentid=%s AND doctorid=%s", [appointment_id, request.user.permanent_id])


def _is_child(pid):
    return (pid or "").upper().startswith("CHILD")


def patient_profile(pid):
    if _is_child(pid):
        return one("SELECT child_id AS permanentid, childfname AS fname, mname, lname, dob, age, gender, bloodgroup, mobno, email, "
                   "past_history, drug_history, parent_id FROM child_reg WHERE child_id=%s", [pid]) or {}
    return one("SELECT permanentid, fname, mname, lname, dob, age, gender, marital, bloodgroup, mobno, email, address, city, "
               "family_history, past_history, drug_history, social_history, approved_by FROM patient WHERE permanentid=%s", [pid]) or {}


def doctor_card(doctor_id):
    return one("SELECT d.permanentid, d.fname, d.lname, d.deptname, d.specialization, d.qualification, d.mciregno, d.hospital_id, "
               "h.hospital_name, h.address AS hospital_address, h.city AS hospital_city, h.land_phone AS hospital_phone, "
               "h.hospital_email FROM doctor d LEFT JOIN hospital h ON h.permanentid=d.hospital_id WHERE d.permanentid=%s", [doctor_id]) or {}


def all_pharmacies():
    return rows("SELECT permanentid AS id, pharmacy_name AS name, address, city, land_phone AS phone FROM pharmacy "
                "WHERE permanentid IS NOT NULL AND permanentid<>'' ORDER BY pharmacy_name")


def all_labs():
    return rows("SELECT permanentid AS id, labname AS name, address, city, land_phone AS phone FROM lab "
                "WHERE permanentid IS NOT NULL AND permanentid<>'' ORDER BY labname")


def affiliated_ids(hospital_id, kind):
    col = "affiliated_pharmacy_list" if kind == "pharmacy" else "affiliated_labs_list"
    h = one(f"SELECT {col} v FROM hospital WHERE permanentid=%s", [hospital_id]) or {}
    return [x.strip() for x in (h.get("v") or "").split(",") if x.strip()]


def split_symptoms(raw):
    seen, out = set(), []
    for s in (raw or "").split(","):
        s = re.sub(r"^\s*-+\s*", "", s).strip()
        s = re.sub(r"\s+", " ", s)
        key = re.sub(r"[-\s]+", " ", re.sub(r" *\([^)]*\) *", " ", s)).strip().upper()
        if key and key not in seen:
            seen.add(key)
            out.append(s)
    return out


def latest_history(pid, apnt_id=None):
    cols = ", ".join(HISTORY_TEXT + HISTORY_JSON)
    r = None
    if apnt_id:
        r = one(f"SELECT {cols} FROM patient_reportfile_data WHERE patient_id=%s AND apnt_id=%s", [pid, apnt_id])
    if not r:
        r = one(f"SELECT {cols} FROM patient_reportfile_data WHERE patient_id=%s ORDER BY date_time DESC LIMIT 1", [pid])
    return {k: (r or {}).get(k) or "" for k in HISTORY_TEXT + HISTORY_JSON}


def orders_for(appointment_id):
    meds = rows("SELECT order_id, pharmacy_id, pharmacy_name, confirmation_status, medicine_name, medicine_quantity, medicine_duration, "
                "medicine_usage, medicine_instructions, repeat_medicine, date_time FROM pharmacy_orders WHERE apnt_id=%s ORDER BY order_id, date_time",
                [appointment_id])
    labs = rows("SELECT order_id, labid, labname, status, lab_test_name, repeat_test, emergency_test, date_time, "
                "(report_file IS NOT NULL) AS has_report FROM lab_order WHERE apnt_id=%s ORDER BY order_id, date_time", [appointment_id])

    def group(items, head):
        out = {}
        for r in items:
            g = out.setdefault(r["order_id"], {"order_id": r["order_id"], **{h: r[h] for h in head}, "items": []})
            g["items"].append({k: v for k, v in r.items() if k not in head and k != "order_id"})
        return list(out.values())
    return group(meds, ["pharmacy_id", "pharmacy_name", "confirmation_status"]), group(labs, ["labid", "labname", "status"])


@api_view(["GET"])
@permission_classes([IsDoctor])
def visit(request, appointment_id):
    a = _appt(request, appointment_id)
    if not a:
        return Response({"status": "not_found"}, status=404)
    pid = a["permanentid"]
    doc = doctor_card(request.user.permanent_id)
    report = one("SELECT * FROM patient_reportfile_data WHERE apnt_id=%s", [appointment_id])
    aff_p, aff_l = affiliated_ids(doc.get("hospital_id"), "pharmacy"), affiliated_ids(doc.get("hospital_id"), "lab")
    pharm, labs = all_pharmacies(), all_labs()
    for p in pharm:
        p["affiliated"] = p["id"] in aff_p
    for l in labs:
        l["affiliated"] = l["id"] in aff_l
    prescriptions, lab_orders = orders_for(appointment_id)
    return Response({
        "appointment": a,
        "writable": a["appointment_type"] in WRITABLE and report is None,
        "report_sent": report is not None,
        "patient": patient_profile(pid),
        "doctor": doc,
        "symptoms": split_symptoms(a.get("symptoms_list")),
        "summary": {
            "problems": rows("SELECT pat_problems AS name, status, apnt_id, date_time FROM patient_problems WHERE patient_id=%s ORDER BY date_time DESC", [pid]),
            "flags": rows("SELECT pat_flags AS name, status, apnt_id, date_time FROM patient_flags WHERE patient_id=%s ORDER BY date_time DESC", [pid]),
            "allergies": rows("SELECT allergy_name, allergies_severity, allergies_description, status, apnt_id, date_time FROM patient_allergies "
                              "WHERE patient_id=%s ORDER BY date_time DESC", [pid]),
            "patient_allergies": rows("SELECT allergy_name, allergies_severity, allergies_description, status, date_time FROM patient_add_allergies "
                                      "WHERE patient_id=%s ORDER BY date_time DESC", [pid]),
            "past_visits": rows("SELECT r.apnt_id, r.apnt_details, r.case_status, r.date_time, a.doctor_name, a.hospital_name, a.deptname "
                                "FROM patient_reportfile_data r JOIN appointment a ON a.appointmentid=r.apnt_id WHERE r.patient_id=%s "
                                "ORDER BY r.date_time DESC", [pid]),
            "history": latest_history(pid, appointment_id),
        },
        "prescriptions": prescriptions,
        "lab_orders": lab_orders,
        "options": {"pharmacies": pharm, "labs": labs},
        "report": report,
    })


@api_view(["POST"])
@permission_classes([IsDoctor])
def update_symptoms(request, appointment_id):
    """Java addSymptomsList (append) / updateSymptomsList (replace) -> appointment.symptoms_list."""
    a = _appt(request, appointment_id)
    if not a:
        return Response({"status": "not_found"}, status=404)
    if a["appointment_type"] not in WRITABLE:
        return Response({"status": "appointment_closed"}, status=409)
    items = request.data.get("symptoms")
    if not isinstance(items, list):
        return Response({"status": "invalid_items"}, status=400)
    clean = split_symptoms(",".join(str(x).replace(",", " ") for x in items))
    value = ",".join(s.replace(" ", "-") for s in clean)
    if len(value) > 600:
        return Response({"status": "too_long", "max": 600}, status=400)
    run("UPDATE appointment SET symptoms_list=%s WHERE appointmentid=%s", [value, appointment_id])
    return Response({"status": "updated", "symptoms": clean})


# ---------- report helpers (formats identical to the Java UI) ----------
def _vitals_text(v):
    if isinstance(v, str):
        return v.strip()[:1000], None
    parts = []
    for key, label, unit, ok in VITALS:
        val = str((v or {}).get(key, "") or "").strip()
        if not val:
            continue
        try:
            good = ok(val)
        except ValueError:
            good = False
        if not good:
            return None, key
        parts.append(f"{label}: {val} {unit}")
    return ",".join(parts), None


def _clean(v, n):
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def _yes(v):
    return "YES" if str(v).upper() in ("YES", "TRUE", "1") else "NO"


def _list(values, max_len, limit=50):
    out = []
    for v in values if isinstance(values, list) else []:
        s = _clean(v, 1000)
        if s and s not in out:
            out.append(s)
    if len(out) > limit or any(len(s) > max_len for s in out):
        return None
    return out


def _json_hist(v):
    if isinstance(v, dict):
        clean = {}
        for k, val in v.items():
            k = re.sub(r"[^a-z_]", "", str(k).lower())[:40]
            if isinstance(val, list):
                clean[k] = [_clean(x, 80) for x in val if _clean(x, 80)][:40]
            elif val:
                clean[k] = _clean(val, 80)
        return json.dumps(clean, separators=(",", ":"))
    s = str(v or "").strip()
    return s[:5000]


def _insert_unique(table, col, pid, appointment_id, names):
    existing = {r["v"].lower() for r in rows(f"SELECT {col} v FROM {table} WHERE patient_id=%s AND LOWER(status)='active'", [pid])}
    for n in names:
        if n.lower() not in existing:
            run(f"INSERT INTO {table} (apnt_id, patient_id, {col}) VALUES (%s,%s,%s)", [appointment_id, pid, n])
            existing.add(n.lower())


class _Abort(Exception):
    def __init__(self, response):
        self.response = response


@api_view(["POST"])
@permission_classes([IsDoctor])
def send_report(request, appointment_id):
    a = _appt(request, appointment_id)
    if not a:
        return Response({"status": "not_found"}, status=404)
    if a["appointment_type"] not in WRITABLE:
        return Response({"status": "appointment_closed", "current": a["appointment_type"]}, status=409)
    if one("SELECT 1 x FROM patient_reportfile_data WHERE apnt_id=%s", [appointment_id]):
        return Response({"status": "report_exists"}, status=409)
    d = request.data
    status = str(d.get("status", "")).strip()
    if status not in STATUSES:
        return Response({"status": "status_required"}, status=400)   # Java: "Please select appointment status"
    if status in ("followup", "referral-request") and a["date_of_booking"] and a["date_of_booking"] > date.today().isoformat():
        pass  # allowed, same as Java
    vitals, bad = _vitals_text(d.get("vitals"))
    if bad:
        return Response({"status": "invalid_vital", "field": bad}, status=400)
    problems = _list(d.get("problems"), 200)
    flags = _list(d.get("flags"), 50)
    diagnosis = _list(d.get("diagnosis"), 300)
    if problems is None or flags is None or diagnosis is None:
        return Response({"status": "invalid_items"}, status=400)
    allergies = []
    for it in d.get("allergies") or []:
        n, s, desc = (_clean((it or {}).get(k), 200) for k in ("allergy_name", "allergies_severity", "allergies_description"))
        if not n or not s or len(n) > 45 or len(s) > 45:
            return Response({"status": "invalid_items", "allergy": n}, status=400)
        allergies.append((n, s, desc))
    medicines, tests = [], []
    for m in d.get("medicines") or []:
        m = m or {}
        name = _clean(m.get("medicine_name"), 50)
        if name:
            medicines.append((name, _clean(m.get("medicine_quantity"), 5), _clean(m.get("medicine_duration"), 30),
                              _clean(m.get("medicine_usage"), 40), _clean(m.get("medicine_instructions"), 40), _yes(m.get("repeat_medicine"))))
    for t in d.get("lab_tests") or []:
        t = t or {}
        name = _clean(t.get("lab_test_name"), 60)
        if name:
            tests.append((name, _yes(t.get("repeat_test")), _yes(t.get("emergency_test"))))
    subjective = str(d.get("subjective_symptoms") or "")[:60000]
    objective = str(d.get("objective_symptoms") or "")[:60000]
    review = str(d.get("system_review") or "")[:60000]
    hist = d.get("history") or {}

    # strings exactly like the Java UI built them
    med_text = " " + "".join(f"name-{n},quantity-{q},duration-{du},usage-{u},instruction-{i},repeat_medicine-{r}," for n, q, du, u, i, r in medicines) if medicines else ""
    lab_text = " " + "".join(f"name-{n},repeat_test-{r},emergency_test-{e}," for n, r, e in tests) if tests else ""
    prob_text = "".join(f"name-{p}," for p in problems)
    flag_text = (" " + "".join(f"name-{f}," for f in flags)) if flags else ""
    allergy_text = "".join(f"name-{n},severity-{s},description-{desc}," for n, s, desc in allergies)
    diag_text = "".join(f"{x}," for x in diagnosis)
    if len(med_text) > 2000 or len(lab_text) > 2000 or len(prob_text) > 1000 or len(allergy_text) > 1000 or len(flag_text) > 1000 or len(diag_text) > 1000:
        return Response({"status": "too_long"}, status=400)

    pharm = one("SELECT pharmacy_id, order_id FROM pharmacy_orders WHERE apnt_id=%s ORDER BY date_time DESC, order_id DESC LIMIT 1", [appointment_id]) or {}
    lab = one("SELECT labid, order_id FROM lab_order WHERE apnt_id=%s ORDER BY date_time DESC, order_id DESC LIMIT 1", [appointment_id]) or {}
    doc = doctor_card(request.user.permanent_id)
    pid = a["permanentid"]

    referral = None
    if status == "referral-request":
        r = d.get("referral") or {}
        ref_doc = one("SELECT permanentid, hospital_id, fname, lname FROM doctor WHERE permanentid=%s", [str(r.get("doctor_id", "")).strip()])
        reason = _clean(r.get("reason"), 1000)
        if not ref_doc or ref_doc["permanentid"] == request.user.permanent_id or not reason:
            return Response({"status": "invalid_referral"}, status=400)
        if one("SELECT 1 x FROM referral_appointment WHERE apnt_id=%s", [appointment_id]):
            return Response({"status": "referral_exists"}, status=409)
        referral = (ref_doc, reason)
    follow = None
    if status == "followup":
        f = d.get("followup") or {}
        follow = (str(f.get("date", "")).strip(), str(f.get("time", "")).strip())
        if not all(follow):
            return Response({"status": "followup_slot_required"}, status=400)
        if _is_child(pid):
            pass  # children are booked like patients (child_reg row)

    try:
        with transaction.atomic():
            run("INSERT INTO patient_reportfile_data (patient_id, apnt_id, apnt_details, doctorid, hospital_id, symptoms, vitals, objective_symptoms, "
                "subjective_symptoms, system_review, pharmacy_id, pharmacy_order_id, medicine_prescription, labid, lab_order_id, lab_test_list, problems, "
                "allergies, flags, provisional_diagnosis, diagnosis, case_status, family_history, self_medical_history, drug_history, social_history, "
                "personal_history, smoking_history, surgical_history, alcohol_history, substance_use_history, obstetric_history, menstrual_gyn_history, "
                "sexual_history, psychiatric_history) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [pid, appointment_id, f"{a['date_of_booking']} & {a['time_of_booking']}"[:45], request.user.permanent_id, doc.get("hospital_id") or a["hospital_id"],
                 (a.get("symptoms_list") or "")[:500], vitals, objective, subjective, review,
                 pharm.get("pharmacy_id") or "0", pharm.get("order_id") or 0, med_text, lab.get("labid") or "0", lab.get("order_id") or 0, lab_text,
                 prob_text, allergy_text, flag_text, prob_text, diag_text, status,
                 _clean(hist.get("family_history"), 5000), _clean(hist.get("self_medical_history") or hist.get("past_history"), 5000),
                 _clean(hist.get("drug_history"), 5000), _clean(hist.get("social_history"), 5000),
                 *[_json_hist(hist.get(k)) for k in HISTORY_JSON]])
            # Java patientReportFile -> patient_problems / patient_flags / patient_allergies
            _insert_unique("patient_problems", "pat_problems", pid, appointment_id, problems)
            _insert_unique("patient_flags", "pat_flags", pid, appointment_id, flags)
            for n, s, desc in allergies:
                run("INSERT INTO patient_allergies (apnt_id, patient_id, allergy_name, allergies_severity, allergies_description) VALUES (%s,%s,%s,%s,%s)",
                    [appointment_id, pid, n, s, desc[:200]])
            follow_id = None
            if status == "referral-request":
                ref_doc, reason = referral
                run("INSERT INTO referral_appointment (apnt_id, patient_id, referrer_doc_id, referrer_hospital_id, referred_doc_id, referred_hospital_id, "
                    "referral_reason) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                    [appointment_id, pid, request.user.permanent_id, doc.get("hospital_id") or a["hospital_id"], ref_doc["permanentid"], ref_doc["hospital_id"], reason])
                run("UPDATE appointment SET appointment_type='referral_appointment' WHERE appointmentid=%s", [appointment_id])
            else:
                run("UPDATE appointment SET appointment_type='completed' WHERE appointmentid=%s", [appointment_id])
            if status == "followup":
                ok, code, follow_id = service.create(pid, request.user.permanent_id, follow[0], follow[1], a.get("symptoms_list") or "", "followup")
                if not ok:
                    raise _Abort(Response({"status": code}, status={"slot_unavailable": 409, "patient_conflict": 409, "busy": 503}.get(code, 400)))
    except _Abort as ex:
        return ex.response

    # notifications (Java mailed the patient after a follow-up / referral)
    who = mailer.patient_email(pid)
    if status == "followup":
        mailer.send(who, "Follow-up appointment booked", "Follow-up appointment",
                    [f"Dear {mailer.e(a['fullname'])},", f"Dr. {mailer.e(doc.get('fname'))} {mailer.e(doc.get('lname'))} booked a follow-up appointment for you.",
                     f"Appointment ID: <b>{follow_id}</b>", f"Date / time: <b>{mailer.e(follow[0])} {mailer.e(follow[1])}</b>", f"Hospital: {mailer.e(doc.get('hospital_name'))}"])
    if status == "referral-request":
        ref_doc = referral[0]
        mailer.send(who, "Referral request", "Referral request",
                    [f"Dear {mailer.e(a['fullname'])},", f"Dr. {mailer.e(doc.get('fname'))} {mailer.e(doc.get('lname'))} has referred you to "
                     f"Dr. {mailer.e(ref_doc['fname'])} {mailer.e(ref_doc['lname'])} ({ref_doc['permanentid']}).",
                     "Please log in to the patient portal and accept or cancel the referral request."])
    return Response({"status": "sent", "appointment_type": "referral_appointment" if status == "referral-request" else "completed",
                     "followup_appointment_id": follow_id}, status=201)


# ---------- case files ----------
def can_view_patient(doctor_id, pid):
    return bool(one("SELECT 1 x FROM appointment WHERE doctorid=%s AND permanentid=%s LIMIT 1", [doctor_id, pid]) or
                one("SELECT 1 x FROM referral_appointment WHERE referred_doc_id=%s AND patient_id=%s LIMIT 1", [doctor_id, pid]))


def case_file(apnt_id):
    """Java parentAppointmentReportData / childAppointmentReportData."""
    r = one("SELECT r.*, a.fullname, a.email, a.doctor_name, a.deptname AS dept_name, a.hospital_name, a.date_of_booking, a.time_of_booking, "
            "a.appointment_type, h.address, h.city, h.land_phone, h.hospital_email FROM patient_reportfile_data r "
            "JOIN appointment a ON a.appointmentid=r.apnt_id LEFT JOIN hospital h ON h.permanentid=r.hospital_id WHERE r.apnt_id=%s", [apnt_id])
    if not r:
        return None
    r["patient"] = patient_profile(r["patient_id"])
    d = one("SELECT qualification, specialization, mciregno FROM doctor WHERE permanentid=%s", [r["doctorid"]]) or {}
    r.update({"doctor_" + k: v for k, v in d.items()})
    return r


@api_view(["GET"])
@permission_classes([IsDoctor])
def report_detail(request, apnt_id):
    r = case_file(apnt_id)
    if not r or not can_view_patient(request.user.permanent_id, r["patient_id"]):
        return Response({"status": "not_found"}, status=404)
    return Response({"report": r})


@api_view(["GET"])
@permission_classes([IsDoctor])
def patient_case_files(request, patient_id):
    if not can_view_patient(request.user.permanent_id, patient_id):
        return Response({"status": "forbidden"}, status=403)
    return Response({"case_files": rows(
        "SELECT r.apnt_id, r.apnt_details, r.case_status, r.diagnosis, r.provisional_diagnosis, r.date_time, a.doctor_name, a.deptname, a.hospital_name "
        "FROM patient_reportfile_data r JOIN appointment a ON a.appointmentid=r.apnt_id WHERE r.patient_id=%s ORDER BY r.date_time DESC", [patient_id])})


@api_view(["GET"])
@permission_classes([IsDoctor])
def patient_history(request, patient_id):
    """Java getPatientHistory (13 history fields of the appointment, or the latest visit)."""
    if not can_view_patient(request.user.permanent_id, patient_id):
        return Response({"status": "forbidden"}, status=403)
    return Response({"history": latest_history(patient_id, request.GET.get("apnt_id"))})


@api_view(["GET"])
@permission_classes([IsDoctor])
def most_used_problems(request):
    """Java getMostUsedProblems: split the problems column of this doctor's reports, top 20."""
    counts = {}
    for r in rows("SELECT problems FROM patient_reportfile_data WHERE doctorid=%s AND problems IS NOT NULL AND problems<>''", [request.user.permanent_id]):
        for part in (r["problems"] or "").split(",")[:10]:
            name = re.sub(r"^name-", "", part.strip()).strip()
            if name:
                counts[name] = counts.get(name, 0) + 1
    top = sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:20]
    return Response({"items": [{"problem_name": k, "usage_count": v} for k, v in top]})


@api_view(["POST"])
@permission_classes([IsDoctor])
def drug_interactions(request):
    """Java checkDrugInteractionsBatch: pairs where BOTH drugs are in the doctor's list."""
    meds = [str(m).strip().upper() for m in (request.data.get("medicine_names") or []) if str(m).strip()][:40]
    if len(meds) < 2:
        return Response({"interactions": []})
    ph = ",".join(["%s"] * len(meds))
    found = rows(f"SELECT DISTINCT PrimaryDrug, SecondaryDrug, Severity, PregnancyContraindicated FROM drug_interactions "
                 f"WHERE TRIM(UPPER(PrimaryDrug)) IN ({ph}) AND TRIM(UPPER(SecondaryDrug)) IN ({ph})", meds + meds)
    return Response({"interactions": found})
