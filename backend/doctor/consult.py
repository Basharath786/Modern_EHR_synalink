"""Doctor consultation tools (Phase 3B): problems, flags, allergies, prescriptions, lab orders,
loadouts, history, follow-up. Tables and column rules mirror the Java ReportFile / PharmacyOrders /
LabOrder / MedicinesLoadout classes. Every write is scoped to an appointment owned by the doctor."""
import random

from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsDoctor
from accounts.db import one, rows, run
from booking import service
from .views import COLS, OPEN

WRITABLE = OPEN + ("completed",)       # records can be added during or right after the visit
# Same choices as the Java "Add Medicines" form (checkboxes, several may be ticked -> "Morning, Evening")
USAGE = ["Morning", "Afternoon", "Evening", "SOS"]
INSTRUCTIONS = ["Before Meals", "After Meals"]
UNITS = ["Day(s)"]
SEVERITY = ["Unknown", "Mild", "Mild to Moderate", "Moderate", "Moderate to Severe", "Severe", "Fatal"]
REACTIONS = ["Anaphylaxis", "Angioedema", "Arthralgia", "Conjuctivitis", "Cough", "Confusion", "Chills", "Chest tightness", "Cracked Skin",
             "Diarrhoea", "Dry Skin", "Diarrhea", "Dizziness", "Edema", "Erythema", "Flushed Skin", "Facial Flushing", "Facial Swelling", "Fainting",
             "Fever", "Headache", "Hives", "Irregular Heart Rate", "Itching", "Itchy Throat", "Lightheaded", "Malaise", "Myalgia",
             "Nasal Congestion", "Nausea", "Other", "Pain at injection site", "Soreness at injection site", "Photosensitvity", "Puritis", "Rash",
             "Red Skin", "Respiratory Distress", "Rhinorrhea", "S.O.B", "Skin Rash", "Sore Throat", "Swelling", "Vomiting", "Wheeze"]


def _appt(request, appointment_id, write=False, statuses=False):
    a = one(f"SELECT {COLS} FROM appointment WHERE appointmentid=%s AND doctorid=%s", [appointment_id, request.user.permanent_id])
    if not a:
        return None, Response({"status": "not_found"}, status=404)
    # Java let the doctor switch problem/flag/allergy status from any appointment of the patient
    if write and not statuses and a["appointment_type"] not in WRITABLE:
        return None, Response({"status": "appointment_closed", "current": a["appointment_type"]}, status=409)
    return a, None


def _email(pid):
    if pid.upper().startswith("CHILD"):
        c = one("SELECT email, parent_id FROM child_reg WHERE child_id=%s", [pid]) or {}
        if c.get("email"):
            return c["email"]
        pid = c.get("parent_id") or ""
    return (one("SELECT email FROM patient WHERE permanentid=%s", [pid]) or {}).get("email") or ""


def _order_id():
    while True:
        oid = random.randint(1000, 9999)
        if not any(one(f"SELECT 1 x FROM {t} WHERE order_id=%s LIMIT 1", [oid]) for t in ("pharmacy_orders", "patient_medicines", "lab_order", "patient_labtests")):
            return oid


def _affiliated(hospital_id, kind):
    col, table, name = ("affiliated_pharmacy_list", "pharmacy", "pharmacy_name") if kind == "pharmacy" else ("affiliated_labs_list", "lab", "labname")
    h = one(f"SELECT {col} v FROM hospital WHERE permanentid=%s", [hospital_id]) or {}
    ids = [x.strip() for x in (h.get("v") or "").split(",") if x.strip()]
    if not ids:
        return []
    return rows(f"SELECT permanentid AS id, {name} AS name FROM {table} WHERE permanentid IN %s ORDER BY {name}", [ids])


def _hospital(request):
    return (one("SELECT hospital_id FROM doctor WHERE permanentid=%s", [request.user.permanent_id]) or {}).get("hospital_id")


def _clean_list(values, max_len, limit=30):
    out = []
    for v in values if isinstance(values, list) else []:
        s = str(v).strip()
        if s and s not in out:
            out.append(s)
    if len(out) > limit or any(len(s) > max_len for s in out):
        return None
    return out


@api_view(["GET"])
@permission_classes([IsDoctor])
def consultation(request, appointment_id):
    a, err = _appt(request, appointment_id)
    if err:
        return err
    pid = a["permanentid"]
    meds = rows("SELECT order_id, pharmacy_name, confirmation_status, medicine_name, medicine_quantity, medicine_duration, medicine_usage, "
                "medicine_instructions, repeat_medicine, number_of_days, date_time FROM pharmacy_orders WHERE apnt_id=%s ORDER BY order_id, date_time", [appointment_id])
    labs = rows("SELECT order_id, labname, status, lab_test_name, repeat_test, emergency_test, date_time, (report_file IS NOT NULL) AS has_report "
                "FROM lab_order WHERE apnt_id=%s ORDER BY order_id, date_time", [appointment_id])

    def group(items, key, head):
        out = {}
        for r in items:
            g = out.setdefault(r[key], {"order_id": r[key], **{h: r[h] for h in head}, "items": []})
            g["items"].append({k: v for k, v in r.items() if k not in head and k != key})
        return list(out.values())

    h = _hospital(request)
    return Response({
        "appointment": a,
        "problems": rows("SELECT pat_problems, status, date_time FROM patient_problems WHERE apnt_id=%s ORDER BY date_time", [appointment_id]),
        "allergies": rows("SELECT allergy_name, allergies_severity, allergies_description, status FROM patient_allergies WHERE apnt_id=%s", [appointment_id]),
        "flags": rows("SELECT pat_flags, status FROM patient_flags WHERE apnt_id=%s", [appointment_id]),
        "prescriptions": group(meds, "order_id", ["pharmacy_name", "confirmation_status"]),
        "lab_orders": group(labs, "order_id", ["labname", "status"]),
        "options": {"pharmacies": _affiliated(h, "pharmacy"), "labs": _affiliated(h, "lab"), "usage": USAGE, "instructions": INSTRUCTIONS, "units": UNITS,
                    "severity": SEVERITY, "reactions": REACTIONS},
    })


def _insert_list(request, appointment_id, key, max_len, table, col):
    a, err = _appt(request, appointment_id, write=True)
    if err:
        return err
    items = _clean_list(request.data.get(key), max_len)
    if not items:
        return Response({"status": "invalid_items", "max_length": max_len}, status=400)
    existing = {r["v"].lower() for r in rows(f"SELECT {col} v FROM {table} WHERE patient_id=%s AND LOWER(status)='active'", [a["permanentid"]])}
    new = [i for i in items if i.lower() not in existing]
    with transaction.atomic():
        for i in new:
            run(f"INSERT INTO {table} (apnt_id, patient_id, {col}) VALUES (%s,%s,%s)", [appointment_id, a["permanentid"], i])
    return Response({"status": "added", "added": len(new), "skipped_duplicates": len(items) - len(new)}, status=201)


@api_view(["POST"])
@permission_classes([IsDoctor])
def add_problems(request, appointment_id):
    return _insert_list(request, appointment_id, "problems", 200, "patient_problems", "pat_problems")


@api_view(["POST"])
@permission_classes([IsDoctor])
def add_flags(request, appointment_id):
    return _insert_list(request, appointment_id, "flags", 50, "patient_flags", "pat_flags")


@api_view(["POST"])
@permission_classes([IsDoctor])
def add_allergies(request, appointment_id):
    a, err = _appt(request, appointment_id, write=True)
    if err:
        return err
    items = request.data.get("allergies")
    if not isinstance(items, list) or not items or len(items) > 20:
        return Response({"status": "invalid_items"}, status=400)
    clean = []
    for it in items:
        n, s, d = (str((it or {}).get(k, "")).strip() for k in ("allergy_name", "allergies_severity", "allergies_description"))
        if not n or not s or len(n) > 45 or len(s) > 45 or len(d) > 200:
            return Response({"status": "invalid_items"}, status=400)
        clean.append((n, s, d))
    with transaction.atomic():
        for n, s, d in clean:
            run("INSERT INTO patient_allergies (apnt_id, patient_id, allergy_name, allergies_severity, allergies_description) VALUES (%s,%s,%s,%s,%s)",
                [appointment_id, a["permanentid"], n, s, d])
    return Response({"status": "added", "added": len(clean)}, status=201)


@api_view(["POST"])
@permission_classes([IsDoctor])
def set_status(request, appointment_id):
    """Java statusUpdateForPatientProblems / statusUpdatePatientFlags / statusUpdateForAllergies."""
    a, err = _appt(request, appointment_id, write=True, statuses=True)
    if err:
        return err
    kind, name, status = (str(request.data.get(k, "")).strip() for k in ("kind", "name", "status"))
    spec = {"problem": ("patient_problems", "pat_problems"), "flag": ("patient_flags", "pat_flags"), "allergy": ("patient_allergies", "allergy_name"),
            "patient_allergy": ("patient_add_allergies", "allergy_name")}.get(kind)
    if not spec or not name or status.upper() not in ("ACTIVE", "INACTIVE"):
        return Response({"status": "invalid_request"}, status=400)
    if kind == "patient_allergy":   # Java statusUpdateForPatientAddAllergies (matched by name + severity)
        n = run("UPDATE patient_add_allergies SET status=%s, date_time=NOW() WHERE patient_id=%s AND allergy_name=%s AND allergies_severity=%s",
                ["ACTIVE" if status.upper() == "ACTIVE" else "Inactive", a["permanentid"], name, str(request.data.get("severity", ""))])
        return Response({"status": "updated" if n else "not_found"}, status=200 if n else 404)
    n = run(f"UPDATE {spec[0]} SET status=%s WHERE patient_id=%s AND {spec[1]}=%s", [status.upper(), a["permanentid"], name])
    return Response({"status": "updated" if n else "not_found"}, status=200 if n else 404)


@api_view(["POST"])
@permission_classes([IsDoctor])
def prescribe(request, appointment_id):
    a, err = _appt(request, appointment_id, write=True)
    if err:
        return err
    pharm = one("SELECT permanentid AS id, pharmacy_name AS name FROM pharmacy WHERE permanentid=%s AND permanentid<>''", [str(request.data.get("pharmacy_id", ""))])
    if not pharm:
        return Response({"status": "invalid_pharmacy"}, status=400)
    meds = request.data.get("medicines")
    if not isinstance(meds, list) or not meds or len(meds) > 20:
        return Response({"status": "invalid_items"}, status=400)
    clean = []
    for m in meds:
        m = m or {}
        name = str(m.get("medicine_name", "")).strip()
        usage, instr = str(m.get("medicine_usage", "")).strip(), str(m.get("medicine_instructions", "")).strip()
        dur = str(m.get("medicine_duration", "")).strip()
        try:
            qty = int(m.get("medicine_quantity")); days = int(m.get("number_of_days") or 0)
        except (TypeError, ValueError):
            return Response({"status": "invalid_items", "medicine": name}, status=400)
        if dur.isdigit():                       # Java stored "<days> Day(s) "
            days = days or int(dur)
            dur = f"{int(dur)} Day(s) "
        if not name or len(name) > 50 or not (1 <= qty <= 999) or not (0 <= days <= 365) or len(usage) > 40 or len(instr) > 40 or len(dur) > 30 or not usage or not dur:
            return Response({"status": "invalid_items", "medicine": name}, status=400)
        clean.append((name, qty, dur, usage, instr, "YES" if str(m.get("repeat_medicine", "")).upper() in ("YES", "TRUE") else "NO", days))
    oid, email, pid = _order_id(), _email(a["permanentid"]), a["permanentid"]
    with transaction.atomic():
        for name, qty, dur, usage, instr, rep, days in clean:
            run("INSERT INTO pharmacy_orders (pharmacy_id, pharmacy_name, apnt_id, order_id, medicine_name, medicine_quantity, medicine_duration, "
                "medicine_usage, medicine_instructions, repeat_medicine, patient_id, patient_email, number_of_days) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [pharm["id"], pharm["name"], appointment_id, oid, name, qty, dur, usage, instr, rep, pid, email, days])
            run("INSERT INTO patient_medicines (apnt_id, patient_id, order_id, medicine_name, medicine_quantity, medicine_duration, medicine_usage, "
                "medicine_instructions, repeat_medicine, date, number_of_days) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,CURDATE(),%s)",
                [appointment_id, pid, oid, name, qty, dur, usage, instr, rep, days or None])
    names = ", ".join(c[0] for c in clean)
    mailer.send(email, "Medicine order sent to pharmacy", "Medicine order",
                [f"Your doctor sent a medicine order (Order ID <b>{oid}</b>) to <b>{mailer.e(pharm['name'])}</b>.", f"Medicines: {mailer.e(names)}",
                 f"Appointment ID: {appointment_id}"])
    mailer.send(mailer.pharmacy_email(pharm["id"]), "New medicine order", "New medicine order",
                [f"Order ID <b>{oid}</b> for patient {pid} (appointment {appointment_id}).", f"Medicines: {mailer.e(names)}"])
    return Response({"status": "ordered", "order_id": oid, "pharmacy": pharm["name"], "items": len(clean)}, status=201)


@api_view(["POST"])
@permission_classes([IsDoctor])
def lab_order(request, appointment_id):
    a, err = _appt(request, appointment_id, write=True)
    if err:
        return err
    lab = one("SELECT permanentid AS id, labname AS name FROM lab WHERE permanentid=%s AND permanentid<>''", [str(request.data.get("lab_id", ""))])
    if not lab:
        return Response({"status": "invalid_lab"}, status=400)
    tests = request.data.get("tests")
    if not isinstance(tests, list) or not tests or len(tests) > 20:
        return Response({"status": "invalid_items"}, status=400)
    clean = []
    for t in tests:
        t = t or {}
        name = str(t.get("lab_test_name", "")).strip()
        if not name or len(name) > 40:
            return Response({"status": "invalid_items", "test": name}, status=400)
        yes = lambda k: "YES" if str(t.get(k, "")).upper() in ("YES", "TRUE") else "NO"
        clean.append((name, yes("repeat_test"), yes("emergency_test")))
    oid, email, pid = _order_id(), _email(a["permanentid"]), a["permanentid"]
    with transaction.atomic():
        for name, rep, emer in clean:
            run("INSERT INTO lab_order (labid, labname, apnt_id, order_id, lab_test_name, repeat_test, patient_id, patient_email, emergency_test) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [lab["id"], lab["name"], appointment_id, oid, name, rep, pid, email, emer])
            run("INSERT INTO patient_labtests (apnt_id, patient_id, order_id, lab_test_name, repeat_test, date, emergency_test) VALUES (%s,%s,%s,%s,%s,CURDATE(),%s)",
                [appointment_id, pid, oid, name, rep, emer])
    names = ", ".join(c[0] for c in clean)
    mailer.send(email, "Lab order sent", "Lab order", [f"Your doctor sent a lab order (Order ID <b>{oid}</b>) to <b>{mailer.e(lab['name'])}</b>.",
                                                       f"Tests: {mailer.e(names)}", f"Appointment ID: {appointment_id}"])
    mailer.send(mailer.lab_email(lab["id"]), "New lab order", "New lab order",
                [f"Order ID <b>{oid}</b> for patient {pid} (appointment {appointment_id}).", f"Tests: {mailer.e(names)}"])
    return Response({"status": "ordered", "order_id": oid, "lab": lab["name"], "items": len(clean)}, status=201)


@api_view(["POST"])
@permission_classes([IsDoctor])
def followup(request, appointment_id):
    a, err = _appt(request, appointment_id, write=True)
    if err:
        return err
    if a["permanentid"].upper().startswith("CHILD"):
        return Response({"status": "child_not_supported"}, status=400)   # children booking arrives with the Children module
    date_s, time_s = str(request.data.get("date", "")).strip(), str(request.data.get("time", "")).strip()
    if not (date_s and time_s):
        return Response({"status": "missing_fields"}, status=400)
    ok, code, apid = service.create(a["permanentid"], request.user.permanent_id, date_s, time_s, f"Follow-up of {appointment_id}", "followup")
    codes = {"slot_unavailable": 409, "patient_conflict": 409, "busy": 503}
    return Response({"status": code, "appointment_id": apid}, status=201 if ok else codes.get(code, 400))


@api_view(["POST"])
@permission_classes([IsDoctor])
def update_history(request, patient_id):
    if not one("SELECT 1 x FROM appointment WHERE doctorid=%s AND permanentid=%s LIMIT 1", [request.user.permanent_id, patient_id]):
        return Response({"status": "forbidden"}, status=403)
    child = patient_id.upper().startswith("CHILD")
    allowed = ("past_history", "drug_history") if child else ("family_history", "past_history", "drug_history", "social_history")
    limit = 200 if child else 300
    vals = {k: str(request.data[k]).strip() for k in allowed if k in request.data}
    if not vals or any(len(v) > limit for v in vals.values()):
        return Response({"status": "invalid_items", "max_length": limit}, status=400)
    table, key = ("child_reg", "child_id") if child else ("patient", "permanentid")
    run(f"UPDATE {table} SET " + ", ".join(f"{k}=%s" for k in vals) + f" WHERE {key}=%s", [*vals.values(), patient_id])
    return Response({"status": "updated"})


# ---------- catalogs (search-as-you-type) ----------
def _like(request):
    q = request.GET.get("q", "").strip()
    return f"%{q}%" if len(q) >= 2 else None


@api_view(["GET"])
@permission_classes([IsDoctor])
def catalog_problems(request):
    like = _like(request)
    return Response({"items": [r["v"] for r in rows("SELECT DISTINCT Problems v FROM assessment_database WHERE Problems LIKE %s AND Problems<>'' ORDER BY Problems LIMIT 25", [like])] if like else []})


@api_view(["GET"])
@permission_classes([IsDoctor])
def catalog_flags(request):
    like = _like(request)
    return Response({"items": [r["v"] for r in rows("SELECT DISTINCT Flags v FROM assessment_database WHERE Flags LIKE %s AND Flags<>'' ORDER BY Flags LIMIT 25", [like])] if like else []})


@api_view(["GET"])
@permission_classes([IsDoctor])
def catalog_allergies(request):
    like = _like(request)
    if not like:
        return Response({"items": [], "reactions": []})
    items = rows("SELECT DISTINCT v FROM (SELECT Allergies v FROM assessment_database UNION SELECT DrugAllergy v FROM assessment_database) t "
                 "WHERE v LIKE %s AND v<>'' AND v<>'0' ORDER BY v LIMIT 25", [like])
    return Response({"items": [r["v"] for r in items], "reactions": REACTIONS, "severity": SEVERITY})


@api_view(["GET"])
@permission_classes([IsDoctor])
def catalog_medicines(request):
    like = _like(request)
    return Response({"items": [r["v"] for r in rows("SELECT DISTINCT medicine_name v FROM pharmacy_database WHERE medicine_name LIKE %s ORDER BY medicine_name LIMIT 25", [like])] if like else []})


LAB_CATEGORIES = ["Serum", "Blood", "Stool", "Specimen", "Plasma", "Urine", "Culture", "Biopsy", "CTSCAN", "MRI", "XRay", "Electrodiagnostics",
                  "Procedures", "Ultrasound", "NuclearImaging", "Serology", "CSF", "Fluoroscopy", "DiagnosticTest"]


@api_view(["GET"])
@permission_classes([IsDoctor])
def catalog_lab_tests(request):
    like = _like(request)
    if not like:
        return Response({"items": []})
    parts = " UNION ".join(f"SELECT {c} AS name, '{c}' AS category FROM labtests_database WHERE {c} LIKE %s AND {c}<>''" for c in LAB_CATEGORIES)
    return Response({"items": rows(f"SELECT name, category FROM ({parts}) t ORDER BY name LIMIT 30", [like] * len(LAB_CATEGORIES))})


# ---------- loadouts (saved templates per doctor) ----------
@api_view(["GET", "POST"])
@permission_classes([IsDoctor])
def loadouts(request, kind):
    """Java fetch/send Medicines|Lab Loadout. A loadout belongs to one problem ('' = Universal);
    the name must be unique per doctor; items are stored comma separated like Java."""
    if kind not in ("medicines", "labs"):
        return Response({"status": "not_found"}, status=404)
    me = request.user.permanent_id
    table, item_col, name_col = ("medicines_loadout_table", "medicine_name", "loadout_name") if kind == "medicines" else ("lab_loadout_table", "lab_test_name", "lab_loadout_name")
    if request.method == "GET":
        sql = f"SELECT {name_col} AS loadout_name, problem_name, {item_col} AS items FROM {table} WHERE doctorid=%s"
        args = [me]
        if "problem" in request.GET:
            sql += " AND COALESCE(problem_name,'')=%s"
            args.append(request.GET.get("problem", "").strip())
        out = rows(sql + f" ORDER BY {name_col}", args)
        for r in out:
            r["items"] = [x.strip() for x in (r["items"] or "").split(",") if x.strip()]
        return Response({"loadouts": out})
    name = str(request.data.get("loadout_name", "")).strip()
    problem = str(request.data.get("problem_name", "")).strip()
    items = _clean_list(request.data.get("items"), 200, limit=40)
    joined = ",".join(items or [])
    if not name or len(name) > 45 or not items or len(problem) > 200 or len(joined) > 200:
        return Response({"status": "invalid_items", "max_length": 200}, status=400)
    if one(f"SELECT 1 x FROM {table} WHERE doctorid=%s AND {name_col}=%s", [me, name]):
        return Response({"status": "duplicate_name"}, status=409)
    run(f"INSERT INTO {table} (doctorid, problem_name, {item_col}, {name_col}) VALUES (%s,%s,%s,%s)", [me, problem, joined, name])
    return Response({"status": "saved"}, status=201)


@api_view(["POST"])
@permission_classes([IsDoctor])
def delete_loadout(request, kind):
    """Java deleteMedicinesLoadout / deleteLabLoadout."""
    if kind not in ("medicines", "labs"):
        return Response({"status": "not_found"}, status=404)
    table, name_col = ("medicines_loadout_table", "loadout_name") if kind == "medicines" else ("lab_loadout_table", "lab_loadout_name")
    name = str(request.data.get("loadout_name", "")).strip()
    problem = str(request.data.get("problem_name", "") or "").strip()
    if problem:
        n = run(f"DELETE FROM {table} WHERE doctorid=%s AND {name_col}=%s AND problem_name=%s", [request.user.permanent_id, name, problem])
    else:
        n = run(f"DELETE FROM {table} WHERE doctorid=%s AND {name_col}=%s AND (problem_name IS NULL OR problem_name='')", [request.user.permanent_id, name])
    return Response({"status": "deleted" if n else "not_found"}, status=200 if n else 404)
