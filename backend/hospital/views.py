"""Hospital portal (legacy webui/hospital-portal): dashboard counts, profile, departments,
doctor / nurse / receptionist registration, staff approval and the doctors' weekly default slots.

Legacy endpoints replaced: listCountDetails, hospitalAppointmentCount, listCurrentDateHospitalAppointments,
listShortDetails, listAllDetails, downloadImage, register (DOCTOR / NURSE / RECEPTIONIST / DEPARTMENT),
approve, createDoctorSlot, rescheduleDefaultSlot, deleteEntireSlotsForDay, viewDoctorDefaultSlots."""
from datetime import date, timedelta

from django.db import transaction
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsHospital
from accounts.crypto import encrypt_password
from accounts.db import one, rows, run
from accounts.entities import SPECIALITIES, Form, blob, detail, file_field, listing, new_id, random_password
from accounts.setpw import approval_mail
from doctor.manage import CATALOG, _norm, _overlap, _sorted
from patient.files import file_response

STAFF = {"doctor", "nurse", "receptionist"}
APPROVABLE = {"doctor", "receptionist"}       # tables with a status column (legacy v1/approve)
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
APPT_TYPES = ["consult", "followup", "referral_appointment", "completed", "cancelled", "dns",
              "consult-rescheduled", "followup-rescheduled", "referral-rescheduled"]


def _hid(request):
    return request.user.permanent_id


def _hospital(request):
    return one("SELECT permanentid, hospital_name, specialities_list, hospital_email FROM hospital WHERE permanentid=%s", [_hid(request)]) or {}


# ------------------------------------------------------------------ dashboard / profile
@api_view(["GET"])
@permission_classes([IsHospital])
def dashboard(request):
    h, today = _hid(request), date.today().isoformat()
    c = lambda t, extra="": one(f"SELECT COUNT(*) n FROM {t} WHERE hospital_id=%s {extra}", [h])["n"]
    by_type = {r["appointment_type"]: r["n"] for r in rows(
        "SELECT appointment_type, COUNT(*) n FROM appointment WHERE hospital_id=%s GROUP BY appointment_type", [h])}
    pend = lambda col, to: one(f"SELECT COUNT(*) n FROM affiliation_request WHERE hospital_id=%s AND {col} IS NOT NULL AND {col} NOT IN ('','null') "
                               "AND request_to='hospital' AND status='request-sent'", [h])["n"]
    return Response({
        "hospital": _hospital(request).get("hospital_name"),
        "counts": {"doctors": c("doctor"), "nurses": c("nurse"), "receptionists": c("receptionist"), "departments": c("department")},
        "pending_staff": c("doctor", "AND status='PENDING'") + c("receptionist", "AND status='PENDING'"),
        "pending_affiliations": {"lab": pend("labid", "hospital"), "pharmacy": pend("pharmacy_id", "hospital")},
        "appointments": {t: by_type.get(t, 0) for t in APPT_TYPES},
        "today": rows("SELECT appointmentid, permanentid, fullname, doctor_name, deptname, time_of_booking, appointment_type "
                      "FROM appointment WHERE hospital_id=%s AND date_of_booking=%s ORDER BY time_of_booking", [h, today]),
        "unvalidated_patients": one("SELECT COUNT(*) n FROM patient WHERE approved_by IS NULL OR approved_by=''")["n"],
    })


@api_view(["GET"])
@permission_classes([IsHospital])
def profile(request):
    return Response({"hospital": detail("hospital", _hid(request))})


@api_view(["GET"])
@permission_classes([IsHospital])
def profile_file(request, col):
    return file_response(blob("hospital", _hid(request), col), f"{_hid(request)}_{col}")


# ------------------------------------------------------------------ departments
def _dept_names(h):
    return [r["deptname"] for r in rows("SELECT deptname FROM department WHERE hospital_id=%s ORDER BY deptname", [h])]


@api_view(["GET", "POST"])
@permission_classes([IsHospital])
def departments(request):
    h = _hospital(request)
    if request.method == "GET":
        mine = [x.strip() for x in (h.get("specialities_list") or "").split(",") if x.strip()]
        taken = set(_dept_names(h["permanentid"]))
        return Response({
            "departments": rows("SELECT permanentid, hospital_name, deptname, deptheadname, dept_head_mobile_number, floor_wing, assigneddoctors, "
                                "assignednurses, noofrooms, noofbeds, date_time FROM department WHERE hospital_id=%s ORDER BY deptname", [h["permanentid"]]),
            # legacy department-register.html: department = one of the hospital's specialities
            "options": [s for s in (mine or SPECIALITIES) if s not in taken],
        })
    f = Form(request.data)
    name = f.text("deptname", "Department name", max_len=50, pattern=r"[A-Za-z ,&()-]+", msg="Department name should contain only letters")
    f.text("deptheadname", "Head of department", max_len=20, pattern=r"[A-Za-z .]+", msg="Name should contain only letters")
    f.mobile("dept_head_mobile_number", "Dept head mobile number")
    f.text("floor_wing", "Floor", max_len=20)
    for k, label, mx in (("assigneddoctors", "Assigned doctors", 999), ("assignednurses", "Assigned nurses", 999),
                         ("noofrooms", "Rooms", 9999), ("noofbeds", "Beds", 9999)):
        f.number(k, label, required=False, max_value=mx, default=0)
    if name and name in _dept_names(h["permanentid"]):
        f.errors["deptname"] = "This department is already registered"
    if f.errors:
        return f.response()
    c = f.clean
    pid = new_id("DEPT", "department")
    run("INSERT INTO department (permanentid, pswrd, hospital_id, hospital_name, deptname, deptheadname, dept_head_mobile_number, floor_wing, "
        "assigneddoctors, assignednurses, noofrooms, noofbeds, date_time) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())",
        [pid, encrypt_password(random_password()), h["permanentid"], h["hospital_name"], c["deptname"], c["deptheadname"],
         c["dept_head_mobile_number"], c["floor_wing"], c["assigneddoctors"], c["assignednurses"], c["noofrooms"], c["noofbeds"]])
    mailer.send(h.get("hospital_email"), "Department registered", "Department registered",
                [f"Department <b>{mailer.e(c['deptname'])}</b> ({pid}) was registered.", f"Head of department: {mailer.e(c['deptheadname'])}"])
    return Response({"status": "registered", "permanentid": pid}, status=201)


# ------------------------------------------------------------------ staff lists / details
SHORT = {
    "doctor": "permanentid, fname, mname, lname, specialization, qualification, experience, mobno, deptname, workphone, workemail, status, date_time",
    "nurse": "permanentid, fname, mname, lname, specialization, mobno, deptname, workphone, workemail, date_time",
    "receptionist": "permanentid, fullname, address, mobno, workphone, workemail, jobtype, deptname, status, date_time",
}


@api_view(["GET", "POST"])
@permission_classes([IsHospital])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def staff(request, kind):
    if kind not in STAFF:
        return Response({"status": "not_found"}, status=404)
    if request.method == "POST":
        return _register(request, kind)
    items = rows(f"SELECT {SHORT[kind]} FROM {kind} WHERE hospital_id=%s ORDER BY date_time DESC", [_hid(request)])
    for i in items:
        i["password_set"] = bool((one("SELECT pswrd FROM login WHERE permanentid=%s", [i["permanentid"]]) or {}).get("pswrd"))
    return Response({"items": items})


def _mine(request, kind, pid):
    return kind in STAFF and one(f"SELECT permanentid FROM {kind} WHERE permanentid=%s AND hospital_id=%s", [pid, _hid(request)])


@api_view(["GET"])
@permission_classes([IsHospital])
def staff_detail(request, kind, pid):
    if not _mine(request, kind, pid):
        return Response({"status": "not_found"}, status=404)
    out = {"item": detail(kind, pid)}
    lg = one("SELECT pswrd, systemLoginTime FROM login WHERE permanentid=%s", [pid])
    out["password_set"] = bool(lg and lg.get("pswrd"))
    out["last_login"] = lg.get("systemLoginTime") if lg and lg.get("pswrd") else None
    if kind == "doctor":
        out["slots"] = _default_slots(pid)
        out["upcoming"] = one("SELECT COUNT(*) n FROM appointment WHERE doctorid=%s AND date_of_booking>=CURDATE() "
                              "AND appointment_type NOT IN ('cancelled','completed','dns')", [pid])["n"]
    return Response(out)


@api_view(["GET"])
@permission_classes([IsHospital])
def staff_file(request, kind, pid, col):
    if not _mine(request, kind, pid):
        return Response({"status": "not_found"}, status=404)
    return file_response(blob(kind, pid, col), f"{pid}_{col}")


@api_view(["GET"])
@permission_classes([IsHospital])
def approvals(request):
    """Legacy staff-approval.html: doctors and receptionists of this hospital waiting for approval."""
    h = _hid(request)
    return Response({
        "doctor": rows(f"SELECT {SHORT['doctor']} FROM doctor WHERE hospital_id=%s AND status='PENDING' ORDER BY date_time", [h]),
        "receptionist": rows(f"SELECT {SHORT['receptionist']} FROM receptionist WHERE hospital_id=%s AND status='PENDING' ORDER BY date_time", [h]),
    })


@api_view(["POST"])
@permission_classes([IsHospital])
def approve(request, kind, pid):
    """Legacy v1/approve: status PENDING -> APPROVED, then the 'set your password' mail."""
    if kind not in APPROVABLE or not _mine(request, kind, pid):
        return Response({"status": "not_found"}, status=404)
    n = run(f"UPDATE {kind} SET status='APPROVED', date_time=NOW() WHERE permanentid=%s AND status='PENDING'", [pid])
    if not n:
        return Response({"status": "not_pending", "message": "Already approved."}, status=409)
    email = (one(f"SELECT workemail FROM {kind} WHERE permanentid=%s", [pid]) or {}).get("workemail")
    approval_mail(pid, kind.upper(), email)
    return Response({"status": "approved", "permanentid": pid})


# ------------------------------------------------------------------ registration
GENDERS = {"doctor": ["Male", "Female", "Transgender"], "nurse": ["Male", "Female", "Other"], "receptionist": ["Male", "Female", "Others"]}
MARITAL = ["single", "married", "widowed", "divorced"]
BLOOD = ["A +ve", "A -ve", "B +ve", "B -ve", "O +ve", "O -ve", "AB +ve", "AB -ve"]
JOBS = ["Full Time", "Part Time", "Consultant"]


def _register(request, kind):
    h = _hospital(request)
    f = Form(request.data)
    if kind == "receptionist":
        f.text("fullname", "Full name", max_len=45, pattern=r"[A-Za-z ]+", msg="Name should contain only letters")
    else:
        f.text("fname", "First name", max_len=45, pattern=r"[A-Za-z]+", msg="First name should contain only letters")
        f.text("mname", "Middle name", required=False, max_len=45, pattern=r"[A-Za-z]+", msg="Middle name should contain only letters")
        f.text("lname", "Last name", max_len=45, pattern=r"[A-Za-z]+", msg="Last name should contain only letters")
    f.dob(min_age=18)
    f.choice("gender", "Gender", GENDERS[kind])
    f.choice("marital", "Marital status", MARITAL)
    f.text("address", "Address", max_len=60, pattern=r"[#./0-9A-Za-z\s,-]+", msg="Address can contain letters, numbers and # . , / -")
    if kind != "receptionist":
        f.choice("bloodgroup", "Blood group", BLOOD, required=False)
        f.address_block()
    mob = f.mobile("mobno")
    f.text("workphone", "Work phone number", pattern=r"\d{10,11}", msg="Work phone must be 10 or 11 digits")
    f.email("workemail", "Work email", max_len=45 if kind == "receptionist" else 40)
    f.email("altemail", "Alternative email", required=False, max_len=45 if kind == "receptionist" else 40)
    f.mobile("emergencycontact", "Emergency contact number")
    f.choice("jobtype", "Job type", JOBS)
    f.choice("deptname", "Department", _dept_names(h["permanentid"]))
    f.text("qualification", "Qualification", max_len=45 if kind != "receptionist" else 20, pattern=r"[A-Za-z .,]+", msg="Qualification should contain only letters")
    f.number("experience", "Experience", required=kind == "doctor", max_value=99, default=0)
    if kind != "receptionist":
        f.choice("specialization", "Specialization", SPECIALITIES)
        f.text("mciregno", "MCI registration number", max_len=14 if kind == "doctor" else 20, pattern=r"[A-Za-z0-9/-]+",
               msg="MCI number can contain letters, numbers, / and -")
    f.govt_id()
    files = {}
    for col, label in ((("mcifile", "MCI number proof"),) if kind != "receptionist" else ()) + (("govtidfile", "Govt ID proof"),):
        data, err = file_field(request, col, label)
        if err:
            f.errors[col] = err
        files[col] = data
    if mob and one(f"SELECT permanentid FROM {kind} WHERE mobno=%s", [mob]):
        f.errors["mobno"] = "Mobile number already registered. Please use a different number."
    if f.errors:
        return f.response()
    c = f.clean
    prefix = {"doctor": "DOC", "nurse": "NUR", "receptionist": "REC"}[kind]
    with transaction.atomic():
        pid = new_id(prefix, kind)
        if kind == "receptionist":
            run("INSERT INTO receptionist (permanentid, pswrd, fullname, dob, age, gender, marital, address, mobno, workphone, workemail, altemail, "
                "emergencycontact, jobtype, hospital_name, hospital_id, deptname, qualification, experience, pastworked, govtidtype, govtidno, govtidfile, "
                "status, date_time) VALUES (%s,'',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PENDING',NOW())",
                [pid, c["fullname"], c["dob"], c["age"], c["gender"], c["marital"], c["address"], c["mobno"], c["workphone"], c["workemail"],
                 c["altemail"] or None, c["emergencycontact"], c["jobtype"], h["hospital_name"], h["permanentid"], c["deptname"], c["qualification"],
                 c["experience"], (f.get("pastworked") or "")[:50], c["govtidtype"], c["govtidno"], files["govtidfile"]])
        else:
            cols = ("permanentid, pswrd, fname, lname, mname, dob, age, gender, marital, address, city, state, country, zipcode, mobno, workphone, workemail, "
                    "altemail, emergencycontact, bloodgroup, jobtype, hospital_name, hospital_id, specialization, qualification, experience, pastworked, "
                    "deptname, mciregno, mcifile, govtidtype, govtidno, govtidfile, date_time")
            # legacy: doctor rows carry a throw-away password + status PENDING; nurse rows a random one (never mailed)
            vals = [pid, encrypt_password(random_password()), c["fname"], c["lname"], c["mname"] or None, c["dob"], c["age"], c["gender"], c["marital"],
                    c["address"], c["city"], c["state"], c["country"], int(c["zipcode"]), c["mobno"], c["workphone"], c["workemail"], c["altemail"] or "",
                    c["emergencycontact"], c["bloodgroup"] or "", c["jobtype"], h["hospital_name"], h["permanentid"], c["specialization"],
                    c["qualification"], c["experience"], (f.get("pastworked") or "")[:60], c["deptname"], c["mciregno"], files["mcifile"],
                    c["govtidtype"], c["govtidno"], files["govtidfile"]]
            if kind == "doctor":
                cols += ", status"
                run(f"INSERT INTO doctor ({cols}) VALUES ({','.join(['%s'] * (len(vals)))},NOW(),'PENDING')", vals)
            else:
                run(f"INSERT INTO nurse ({cols}) VALUES ({','.join(['%s'] * (len(vals)))},NOW())", vals)
        # login row with an EMPTY password: the user activates it through "Set password"
        run("INSERT INTO login (permanentid, pswrd, isdefault_password, systemLoginTime, pswrd_changed_time, failed_attempt, account_locked, lock_time) "
            "VALUES (%s,'','YES',NOW(),NOW(),0,'NO',0)", [pid])
    label = kind.upper()
    if kind == "nurse":
        mailer.send(h.get("hospital_email"), "Nurse registered", "Nurse registered",
                    [f"Nurse <b>{mailer.e(c['fname'])} {mailer.e(c['lname'])}</b> ({pid}) was registered in {mailer.e(c['deptname'])}."])
        approval_mail(pid, label, c["workemail"], "registered by your hospital")
    else:
        mailer.send(c["workemail"], f"{label} registration successful - Permanent ID: {pid}", "Registration successful", [
            f"Your {label} registration has been completed successfully.", f"Your Permanent ID: <b>{pid}</b>",
            "Status: <b style='color:#f59e0b'>PENDING APPROVAL</b>",
            "Please wait for hospital admin approval. Once approved, you will receive a link to set your password and access the portal."])
    msg = (f"{label} registered successfully. Permanent ID: {pid}." +
           ("" if kind == "nurse" else " Status: PENDING. Approve the account to send the set-password link."))
    return Response({"status": "registered", "permanentid": pid, "message": msg}, status=201)


# ------------------------------------------------------------------ doctor default (weekly) slots
def _slot_cols(r):
    return [r[f"slot{i}"] for i in range(1, 51) if r.get(f"slot{i}")]


def _default_slots(doctor_id):
    out = {d: [] for d in DAYS}
    for r in rows("SELECT * FROM default_dr_slot WHERE doctorid=%s", [doctor_id]):
        d = (r["day"] or "").strip().lower()
        if d in out:
            for s in _slot_cols(r):
                if _norm(s) not in [_norm(x) for x in out[d]]:
                    out[d].append(s.strip())
    return [{"day": d, "slots": _sorted(v)} for d, v in out.items()]


def _future_bookings(doctor_id, day, slots):
    """Upcoming open appointments of this doctor on that weekday in the given slots."""
    n = {_norm(s) for s in slots}
    out = []
    for a in rows("SELECT appointmentid, date_of_booking, time_of_booking FROM appointment WHERE doctorid=%s AND date_of_booking>=CURDATE() "
                  "AND appointment_type NOT IN ('cancelled','completed','dns')", [doctor_id]):
        d = a["date_of_booking"]
        if isinstance(d, str):
            d = date.fromisoformat(d)
        if DAYS[d.weekday()] == day and _norm(a["time_of_booking"] or "") in n:
            out.append(a)
    return out


def _doctor_of(request, doctor_id):
    return one("SELECT permanentid, fname, lname, workemail, status FROM doctor WHERE permanentid=%s AND hospital_id=%s", [doctor_id, _hid(request)])


def _slot_mail(request, doc, title, lines):
    h = _hospital(request)
    head = [f"Doctor: <b>Dr. {mailer.e(doc['fname'])} {mailer.e(doc['lname'])} ({doc['permanentid']})</b>"]
    mailer.send(h.get("hospital_email"), title, title, head + lines)
    mailer.send(doc.get("workemail"), title, title, head + lines)


@api_view(["GET", "POST"])
@permission_classes([IsHospital])
def doctor_slots(request, doctor_id):
    """GET: weekly default slots + catalog. POST {day, slots[], action: add|remove|clear}."""
    doc = _doctor_of(request, doctor_id)
    if not doc:
        return Response({"status": "not_found"}, status=404)
    if request.method == "GET":
        return Response({"days": _default_slots(doctor_id), "catalog": {"15": CATALOG["first_slots"], "30": CATALOG["second_slots"], "60": CATALOG["third_slots"]}})
    day = str(request.data.get("day", "")).strip().lower()
    action = str(request.data.get("action", "add")).strip().lower()
    if day not in DAYS or action not in ("add", "remove", "clear"):
        return Response({"status": "invalid"}, status=400)
    existing = next(x["slots"] for x in _default_slots(doctor_id) if x["day"] == day)
    allowed = {_norm(s): s for v in CATALOG.values() for s in v}

    if action == "clear":
        if not existing:
            return Response({"status": "no_slots"}, status=404)
        busy = _future_bookings(doctor_id, day, existing)
        if busy:
            return Response({"status": "slot_booked", "appointments": busy}, status=409)
        run("DELETE FROM default_dr_slot WHERE doctorid=%s AND day=%s", [doctor_id, day])         # deleteEntireSlotsForDay
        _slot_mail(request, doc, "Default slots removed", [f"All default slots for <b>{day.capitalize()}</b> were removed."])
        return Response({"status": "cleared", "days": _default_slots(doctor_id)})

    chosen = request.data.get("slots")
    if not isinstance(chosen, list) or not chosen:
        return Response({"status": "select_slots"}, status=400)
    clean = []
    for c in chosen:
        s = allowed.get(_norm(str(c)))
        if not s:
            return Response({"status": "slot_not_allowed", "slot": c}, status=400)
        if s not in clean:
            clean.append(s)

    if action == "add":                                                                         # createDoctorSlot / status 'add'
        have = {_norm(s) for s in existing}
        new = [s for s in clean if _norm(s) not in have]
        for s in new:
            for e in existing + [x for x in new if x != s]:
                if _overlap(s, e):
                    return Response({"status": "overlap", "slot": s, "with": e}, status=409)
        if not new:
            return Response({"status": "nothing_new"}, status=400)
        if len(existing) + len(new) > 50:
            return Response({"status": "too_many", "max": 50}, status=400)
        with transaction.atomic():
            row = one("SELECT * FROM default_dr_slot WHERE doctorid=%s AND day=%s LIMIT 1 FOR UPDATE", [doctor_id, day])
            if not row:
                vals = new + [None] * (50 - len(new))
                run("INSERT INTO default_dr_slot (doctorid, day, " + ", ".join(f"slot{i}" for i in range(1, 51)) + ") VALUES (%s,%s," +
                    ",".join(["%s"] * 50) + ")", [doctor_id, day, *vals])
            else:
                empty = [f"slot{i}" for i in range(1, 51) if not row.get(f"slot{i}")]
                for col, s in zip(empty, new):
                    run(f"UPDATE default_dr_slot SET {col}=%s WHERE doctorid=%s AND day=%s", [s, doctor_id, day])
        _slot_mail(request, doc, "Default slots updated", [f"Day: <b>{day.capitalize()}</b>", f"Added slots: <b>{', '.join(new)}</b>"])
        return Response({"status": "added", "days": _default_slots(doctor_id)})

    # remove (status 'cancel')
    have = {_norm(s) for s in existing}
    gone = [s for s in clean if _norm(s) in have]
    if not gone:
        return Response({"status": "nothing_to_remove"}, status=400)
    busy = _future_bookings(doctor_id, day, gone)
    if busy:
        return Response({"status": "slot_booked", "appointments": busy}, status=409)
    for r in rows("SELECT * FROM default_dr_slot WHERE doctorid=%s AND day=%s", [doctor_id, day]):
        for i in range(1, 51):
            if r.get(f"slot{i}") and _norm(r[f"slot{i}"]) in {_norm(g) for g in gone}:
                run(f"UPDATE default_dr_slot SET slot{i}=NULL WHERE doctorid=%s AND day=%s", [doctor_id, day])
    if not next(x["slots"] for x in _default_slots(doctor_id) if x["day"] == day):
        run("DELETE FROM default_dr_slot WHERE doctorid=%s AND day=%s", [doctor_id, day])
    _slot_mail(request, doc, "Default slots removed", [f"Day: <b>{day.capitalize()}</b>", f"Removed slots: <b>{', '.join(gone)}</b>"])
    return Response({"status": "removed", "days": _default_slots(doctor_id)})
