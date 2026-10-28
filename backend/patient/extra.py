"""Patient portal, part 2 (Phase 2B in the plan):
children (child-registration / child-list / child-appointments), case files and past reports
(patient-casefiles + casefiles.js), referrals (patient-appointments referral tabs), repeat orders
(patient-rxmedications / patient-labrecords "Send Order"), prescription view, change-request
approval (patient-notifications) and the access level (menu-restrictions.js)."""
import json
import random
import re
from datetime import date, datetime

from django.conf import settings
from django.db import transaction
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsPatient
from accounts.crypto import encrypt_password
from accounts.db import one, rows, run
from booking import notify, service
from booking.views import ERR as BOOK_ERR
from doctor.manage import referral_rows
from doctor.visit import case_file

from .files import file_response, read_upload, strip_multipart
from .access import is_validated, require_validated
from .views import _email_of, _pid

APPT_COLS = ("appointmentid, permanentid, fullname, doctorid, doctor_name, hospital_id, hospital_name, deptname, date_of_booking, "
             "time_of_booking, appointment_type, pat_cancel_reason, cancelled_by, rescheduled_by, symptoms_list, date_time")


def _me(request):
    return request.user.permanent_id


def _my_child(request, child_id):
    return one("SELECT * FROM child_reg WHERE child_id=%s AND parent_id=%s", [(child_id or "").upper(), _me(request)])


@api_view(["GET"])
@permission_classes([IsPatient])
def access(request):
    return Response({"validated": is_validated(request.user.permanent_id)})



# ======================= children =======================
CHILD_HISTORY = ["None", "Heart Attack", "Diabetes", "Dwarfism", "Cretinism", "Kidney Disease", "Blood Disorders", "Lung Disease",
                 "High Blood Pressure", "Asthma", "High Cholestrol", "Cancer", "Stroke", "Genetic Birth Disorder", "Dementia", "Alzeihmers",
                 "Anemia", "Heart Defect", "Spinal Defect", "Liver Disorders", "Surgeries", "Allergies"]
CHILD_DRUGS = ["None", "Opiods", "Cocaine", "Heroin", "LSD", "PCP", "Marijuana", "Long Standing Medication"]
GOVT_ID_TYPES = ["Aadhaar Card"]          # the Java form offered only Aadhaar (12 digits, first digit 2-9)
BLOOD_GROUPS = ["A +ve", "A -ve", "B +ve", "B -ve", "AB +ve", "AB -ve", "O +ve", "O -ve"]


@api_view(["GET", "POST"])
@permission_classes([IsPatient])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@require_validated
def children(request):
    me = _me(request)
    if request.method == "GET":
        items = rows("SELECT child_id, childfname, mname, lname, dob, age, gender, email, mobno, bloodgroup, govtidtype, govtidno, "
                     "(govtidfile IS NOT NULL AND LENGTH(govtidfile)>0) AS has_govtid_file, past_history, drug_history, date_time "
                     "FROM child_reg WHERE parent_id=%s ORDER BY date_time DESC", [me])
        for c in items:   # Java updateChildDateofbirth keeps the age current
            if c["dob"]:
                t = date.today()
                c["age"] = str(t.year - c["dob"].year - ((t.month, t.day) < (c["dob"].month, c["dob"].day)))
        return Response({"children": items, "options": {"past_history": CHILD_HISTORY, "drug_history": CHILD_DRUGS,
                                                        "govt_id_types": GOVT_ID_TYPES, "blood_groups": BLOOD_GROUPS}})
    # ---- Java register (Role CHILD) ----
    d = request.data
    g = lambda k, n: str(d.get(k, "") or "").strip()[:n]
    fname, lname, mname = g("childfname", 45), g("lname", 45), g("mname", 45)
    gender, bg, idtype, idno = g("gender", 15), g("bloodgroup", 15) or "None", g("govtidtype", 20), g("govtidno", 20)
    mob = re.sub(r"\D", "", g("mobno", 15)) or "0"
    try:
        dob = date.fromisoformat(g("dob", 10))
    except ValueError:
        return Response({"status": "invalid_dob"}, status=400)
    if not (fname and lname and gender and idtype and idno):
        return Response({"status": "missing_fields"}, status=400)
    if dob > date.today() or (date.today().year - dob.year) > 18:
        return Response({"status": "invalid_dob", "message": "Child must be 18 years or younger."}, status=400)
    if mob != "0" and len(mob) != 10:
        return Response({"status": "invalid_mobile"}, status=400)
    if idtype not in GOVT_ID_TYPES or not re.fullmatch(r"[2-9][0-9]{11}", idno):
        return Response({"status": "invalid_govt_id", "message": "Aadhaar card number must be 12 digits (not starting with 0 or 1)."}, status=400)
    pick = lambda key, allowed: ",".join(x for x in (d.getlist(key) if hasattr(d, "getlist") else (d.get(key) or [])) if x in allowed) or "None"
    past, drugs = pick("past_history", CHILD_HISTORY)[:200], pick("drug_history", CHILD_DRUGS)[:200]
    blob = None
    if request.FILES.get("govtidfile"):
        blob, err = read_upload(request.FILES["govtidfile"], settings.MAX_UPLOAD_BYTES)
        if err:
            return err
    age = date.today().year - dob.year - ((date.today().month, date.today().day) < (dob.month, dob.day))
    email = (one("SELECT email FROM patient WHERE permanentid=%s", [me]) or {}).get("email") or ""
    while True:
        cid = "CHILD" + "".join(random.choice("0123456789") for _ in range(5))
        if not one("SELECT 1 x FROM child_reg WHERE child_id=%s", [cid]):
            break
    temp = "".join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789") for _ in range(8))
    run("INSERT INTO child_reg (child_id, pswrd, parent_id, childfname, lname, mname, dob, age, gender, email, mobno, bloodgroup, govtidtype, "
        "govtidno, govtidfile, past_history, drug_history) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        [cid, encrypt_password(temp), me, fname, lname, mname or " ", dob, str(age), gender, email[:45], int(mob), bg, idtype, idno, blob, past, drugs])
    mailer.send(email, "Child registered", "Child registration successful",
                [f"Your child <b>{mailer.e(fname)} {mailer.e(lname)}</b> has been registered.", f"Child ID: <b>{cid}</b>",
                 "You can book appointments for your child from the patient portal."])
    return Response({"status": "registered", "child_id": cid}, status=201)


@api_view(["GET"])
@permission_classes([IsPatient])
def child_govtid(request, child_id):
    c = _my_child(request, child_id)
    return file_response((c or {}).get("govtidfile"), f"{child_id}-govt-id")


@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def child_appointments(request):
    """Java listChildAppointments (all children of the parent) - same 'dns' rule as the patient list."""
    me = _me(request)
    run("UPDATE appointment a JOIN child_reg c ON c.child_id=a.permanentid SET a.appointment_type='dns' WHERE c.parent_id=%s "
        "AND DATE(a.date_of_booking) < CURDATE() AND a.appointment_type NOT IN ('completed','cancelled','dns','referral_appointment')", [me])
    return Response({"appointments": rows(f"SELECT a.{APPT_COLS.replace(', ', ', a.')} FROM appointment a JOIN child_reg c ON c.child_id=a.permanentid "
                                          "WHERE c.parent_id=%s ORDER BY a.date_time DESC", [me])})


@api_view(["POST"])
@permission_classes([IsPatient])
@require_validated
def child_book(request, child_id):
    c = _my_child(request, child_id)
    if not c:
        return Response({"status": "not_found"}, status=404)
    d = request.data
    ok, code, apid = service.create(c["child_id"], str(d.get("doctor_id", "")).strip(), str(d.get("date", "")).strip(),
                                    str(d.get("time", "")).strip(), d.get("symptoms", ""), str(d.get("type", "consult")))
    if not ok:
        return Response({"status": code}, status=BOOK_ERR.get(code, 400))
    notify.booked(apid)
    return Response({"status": "booked", "appointment_id": apid}, status=201)


def _child_appt(request, appointment_id):
    return one(f"SELECT a.* FROM appointment a JOIN child_reg c ON c.child_id=a.permanentid WHERE a.appointmentid=%s AND c.parent_id=%s",
               [appointment_id, _me(request)])


@api_view(["POST"])
@permission_classes([IsPatient])
def child_cancel(request, appointment_id):
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 30:
        return Response({"status": "reason_too_long", "max": 30}, status=400)
    a = _child_appt(request, appointment_id)
    if not a:
        return Response({"status": "not_found"}, status=404)
    if not service.cancel(a, reason, "PATIENT"):
        return Response({"status": "not_cancellable", "current": a["appointment_type"]}, status=409)
    notify.cancelled(a["appointmentid"], reason, "parent")
    return Response({"status": "cancelled"})


@api_view(["POST"])
@permission_classes([IsPatient])
def child_reschedule(request, appointment_id):
    a = _child_appt(request, appointment_id)
    if not a:
        return Response({"status": "not_found"}, status=404)
    ok, code = service.reschedule(a, str(request.data.get("date", "")).strip(), str(request.data.get("time", "")).strip(), "PATIENT")
    if ok:
        notify.rescheduled(appointment_id)
    return Response({"status": code}, status=200 if ok else BOOK_ERR.get(code, 400))


# ======================= case files & past reports =======================
@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def case_files(request):
    """Java patientReportData (Summary by Doctor). ?for=CHILDxxxx for a child; ?all=1 lists self + children."""
    me = _me(request)
    if request.GET.get("all"):
        ids = [me] + [c["child_id"] for c in rows("SELECT child_id FROM child_reg WHERE parent_id=%s", [me])]
    else:
        ids = [_pid(request)]
    return Response({"case_files": rows(
        "SELECT r.patient_id, r.apnt_id, r.apnt_details, r.case_status, r.diagnosis, r.provisional_diagnosis, r.symptoms, r.date_time, "
        "a.doctor_name, a.deptname, a.hospital_name FROM patient_reportfile_data r JOIN appointment a ON a.appointmentid=r.apnt_id "
        "WHERE r.patient_id IN %s ORDER BY r.date_time DESC", [ids])})


@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def case_file_detail(request, apnt_id):
    """Java parentAppointmentReportData / childAppointmentReportData (case file preview / download)."""
    r = case_file(apnt_id)
    me = _me(request)
    if not r or not (r["patient_id"] == me or _my_child(request, r["patient_id"])):
        return Response({"status": "not_found"}, status=404)
    return Response({"report": r})


@api_view(["GET", "POST"])
@permission_classes([IsPatient])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@require_validated
def past_reports(request):
    """Java listPatientPastReportsInfo / listChildPastReportsInfo / uploadPastReportFileToDb.
    Upload: a unique file name (max 45) + a PDF below 1 MB, for self or ?for=CHILDxxxx."""
    me = _me(request)
    if request.method == "GET":
        if request.GET.get("all"):
            return Response({
                "self": rows("SELECT patient_id, file_name, date FROM patient_past_report WHERE patient_id=%s ORDER BY date DESC", [me]),
                "children": rows("SELECT r.patient_id, r.file_name, r.date, CONCAT_WS(' ', c.childfname, c.lname) AS child_name FROM patient_past_report r "
                                 "JOIN child_reg c ON c.child_id=r.patient_id WHERE c.parent_id=%s ORDER BY r.date DESC", [me])})
        return Response({"reports": rows("SELECT patient_id, file_name, date FROM patient_past_report WHERE patient_id=%s ORDER BY date DESC", [_pid(request)])})
    pid = _pid(request)
    name = str(request.data.get("file_name", "")).strip()
    if not name or len(name) > 45 or not re.fullmatch(r"[A-Za-z0-9 _.\-()]+", name):
        return Response({"status": "invalid_file_name", "max": 45}, status=400)
    if one("SELECT 1 x FROM patient_past_report WHERE patient_id=%s AND file_name=%s", [pid, name]):
        return Response({"status": "duplicate_file_name"}, status=409)   # Java: "Please give a unique name for your file"
    blob, err = read_upload(request.FILES.get("file"), 1024 * 1024, allowed=("pdf",))
    if err:
        return err
    run("INSERT INTO patient_past_report (patient_id, file_name, past_reportfile, date) VALUES (%s,%s,%s,CURDATE())", [pid, name, blob])
    return Response({"status": "uploaded"}, status=201)


@api_view(["GET"])
@permission_classes([IsPatient])
def past_report_file(request):
    pid = _pid(request)
    r = one("SELECT past_reportfile f FROM patient_past_report WHERE patient_id=%s AND file_name=%s LIMIT 1", [pid, request.GET.get("name", "")])
    return file_response(strip_multipart((r or {}).get("f")), request.GET.get("name", "report"))


@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def order_detail(request, kind, order_id):
    """Prescription / lab-order view for the 'Download Prescription' modal."""
    me = _me(request)
    ids = [me] + [c["child_id"] for c in rows("SELECT child_id FROM child_reg WHERE parent_id=%s", [me])]
    if kind == "medicines":
        items = rows("SELECT * FROM pharmacy_orders WHERE order_id=%s AND patient_id IN %s ORDER BY date_time", [order_id, ids])
    elif kind == "labs":
        items = rows("SELECT labid, labname, apnt_id, order_id, lab_test_name, repeat_test, emergency_test, patient_id, status, lab_cancel_reason, "
                     "date_time, (report_file IS NOT NULL) AS has_report FROM lab_order WHERE order_id=%s AND patient_id IN %s ORDER BY date_time", [order_id, ids])
    else:
        return Response({"status": "not_found"}, status=404)
    if not items:
        return Response({"status": "not_found"}, status=404)
    a = one("SELECT a.appointmentid, a.fullname, a.doctor_name, a.deptname, a.hospital_name, a.date_of_booking, a.time_of_booking, h.address, h.city, "
            "h.land_phone FROM appointment a LEFT JOIN hospital h ON h.permanentid=a.hospital_id WHERE a.appointmentid=%s", [items[0]["apnt_id"]]) or {}
    return Response({"items": items, "appointment": a})


# ======================= repeat orders =======================
def _order_id():
    while True:
        oid = random.randint(1000, 9999)
        if not any(one(f"SELECT 1 x FROM {t} WHERE order_id=%s LIMIT 1", [oid]) for t in ("pharmacy_orders", "patient_medicines", "lab_order", "patient_labtests")):
            return oid


@api_view(["GET"])
@permission_classes([IsPatient])
def directory(request, kind):
    """Java listAllPharma / listAllLabs (Send Order lists)."""
    if kind == "pharmacies":
        return Response({"items": rows("SELECT permanentid AS id, pharmacy_name AS name, address, city, land_phone AS phone FROM pharmacy "
                                       "WHERE permanentid<>'' ORDER BY pharmacy_name")})
    if kind == "labs":
        return Response({"items": rows("SELECT permanentid AS id, labname AS name, address, city, land_phone AS phone FROM lab "
                                       "WHERE permanentid<>'' ORDER BY labname")})
    return Response({"status": "not_found"}, status=404)


@api_view(["POST"])
@permission_classes([IsPatient])
@require_validated
def reorder_medicine(request):
    """Java patient-rxmedications 'Send Order': re-send a prescribed medicine (repeat_medicine=YES)
    to any pharmacy. New order id, written to pharmacy_orders + patient_medicines."""
    pid = _pid(request)
    d = request.data
    src = one("SELECT * FROM patient_medicines WHERE patient_id=%s AND order_id=%s AND medicine_name=%s LIMIT 1",
              [pid, d.get("order_id", 0), str(d.get("medicine_name", ""))])
    if not src:
        return Response({"status": "not_found"}, status=404)
    if (src["repeat_medicine"] or "").upper() != "YES":
        return Response({"status": "not_repeatable"}, status=409)
    ph = one("SELECT permanentid AS id, pharmacy_name AS name FROM pharmacy WHERE permanentid=%s AND permanentid<>''", [str(d.get("pharmacy_id", ""))])
    if not ph:
        return Response({"status": "invalid_pharmacy"}, status=400)
    oid, email = _order_id(), _email_of(pid)
    with transaction.atomic():
        run("INSERT INTO pharmacy_orders (pharmacy_id, pharmacy_name, apnt_id, order_id, medicine_name, medicine_quantity, medicine_duration, "
            "medicine_usage, medicine_instructions, repeat_medicine, patient_id, patient_email, number_of_days) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'YES',%s,%s,%s)",
            [ph["id"], ph["name"], src["apnt_id"], oid, src["medicine_name"], src["medicine_quantity"], src["medicine_duration"], src["medicine_usage"],
             src["medicine_instructions"], pid, email[:50], src["number_of_days"] if str(src["number_of_days"] or "").isdigit() else None])
        run("INSERT INTO patient_medicines (apnt_id, patient_id, order_id, medicine_name, medicine_quantity, medicine_duration, medicine_usage, "
            "medicine_instructions, repeat_medicine, date, number_of_days) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'YES',CURDATE(),%s)",
            [src["apnt_id"], pid, oid, src["medicine_name"], src["medicine_quantity"], src["medicine_duration"], src["medicine_usage"],
             src["medicine_instructions"], src["number_of_days"]])
    mailer.send(mailer.pharmacy_email(ph["id"]), "New medicine order", "New medicine order",
                [f"Patient {pid} sent a repeat order (Order ID <b>{oid}</b>).", f"Medicine: {mailer.e(src['medicine_name'])} x {src['medicine_quantity']}"])
    mailer.send(email, "Medicine order sent", "Medicine order", [f"Your order <b>{oid}</b> was sent to {mailer.e(ph['name'])}."])
    return Response({"status": "ordered", "order_id": oid, "pharmacy": ph["name"]}, status=201)


@api_view(["POST"])
@permission_classes([IsPatient])
@require_validated
def reorder_lab(request):
    """Java patient-labrecords 'Send Order': repeat a lab test (repeat_test=YES) at any lab."""
    pid = _pid(request)
    d = request.data
    src = one("SELECT * FROM patient_labtests WHERE patient_id=%s AND order_id=%s AND lab_test_name=%s LIMIT 1",
              [pid, d.get("order_id", 0), str(d.get("lab_test_name", ""))])
    if not src:
        return Response({"status": "not_found"}, status=404)
    if (src["repeat_test"] or "").upper() != "YES":
        return Response({"status": "not_repeatable"}, status=409)
    lab = one("SELECT permanentid AS id, labname AS name FROM lab WHERE permanentid=%s AND permanentid<>''", [str(d.get("lab_id", ""))])
    if not lab:
        return Response({"status": "invalid_lab"}, status=400)
    oid, email = _order_id(), _email_of(pid)
    with transaction.atomic():
        run("INSERT INTO lab_order (labid, labname, apnt_id, order_id, lab_test_name, repeat_test, patient_id, patient_email, emergency_test) "
            "VALUES (%s,%s,%s,%s,%s,'YES',%s,%s,%s)", [lab["id"], lab["name"], src["apnt_id"], oid, src["lab_test_name"][:40], pid, email[:45],
                                                      (src["emergency_test"] or "NO")[:5]])
        run("INSERT INTO patient_labtests (apnt_id, patient_id, order_id, lab_test_name, repeat_test, date, emergency_test) VALUES (%s,%s,%s,%s,'YES',CURDATE(),%s)",
            [src["apnt_id"], pid, oid, src["lab_test_name"], src["emergency_test"] or "NO"])
    mailer.send(mailer.lab_email(lab["id"]), "New lab order", "New lab order",
                [f"Patient {pid} sent a repeat lab order (Order ID <b>{oid}</b>).", f"Test: {mailer.e(src['lab_test_name'])}"])
    return Response({"status": "ordered", "order_id": oid, "lab": lab["name"]}, status=201)


# ======================= referrals =======================
def _my_referral(request, apnt_id):
    me = _me(request)
    r = one("SELECT r.* FROM referral_appointment r LEFT JOIN child_reg c ON c.child_id=r.patient_id WHERE r.apnt_id=%s "
            "AND (r.patient_id=%s OR c.parent_id=%s)", [apnt_id, me, me])
    return r


@api_view(["GET"])
@permission_classes([IsPatient])
def referrals(request):
    """Java listReferralPatientDetails (+ children). Tabs: requests, doctor pending, accepted, booked, cancelled."""
    me = _me(request)
    items = referral_rows("WHERE (r.patient_id=%s OR r.patient_id IN (SELECT child_id FROM child_reg WHERE parent_id=%s))", [me, me])
    booked = rows(f"SELECT {APPT_COLS} FROM appointment WHERE (permanentid=%s OR permanentid IN (SELECT child_id FROM child_reg WHERE parent_id=%s)) "
                  "AND appointment_type IN ('referral','referral-rescheduled') ORDER BY date_of_booking DESC", [me, me])
    return Response({"referrals": items, "booked": booked})


@api_view(["POST"])
@permission_classes([IsPatient])
def accept_referral(request, apnt_id):
    """Java patientAcceptReferralAppointment (patient_status='accepted'); the referred doctor decides next."""
    r = _my_referral(request, apnt_id)
    if not r:
        return Response({"status": "not_found"}, status=404)
    if r["patient_status"] != "pending":
        return Response({"status": "not_pending", "current": r["patient_status"]}, status=409)
    run("UPDATE referral_appointment SET patient_status='accepted' WHERE apnt_id=%s", [apnt_id])
    d = one("SELECT fname, lname FROM doctor WHERE permanentid=%s", [r["referred_doc_id"]]) or {}
    mailer.send(_email_of(r["patient_id"]), "Referral accepted", "Referral accepted",
                [f"Your referral appointment request has been accepted.", f"Referred doctor: Dr. {mailer.e(d.get('fname'))} {mailer.e(d.get('lname'))} ({r['referred_doc_id']})"])
    mailer.send(mailer.doctor_email(r["referred_doc_id"]), "New referral request", "Referral request",
                [f"Patient {r['patient_id']} accepted a referral to you (referral {apnt_id}).", f"Reason: {mailer.e(r['referral_reason'])}",
                 "Please accept or decline it in the doctor portal."])
    return Response({"status": "accepted"})


@api_view(["POST"])
@permission_classes([IsPatient])
def cancel_referral(request, apnt_id):
    """Java patientCancelReferralAppointment (pat_cancel_reason varchar 200)."""
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 200:
        return Response({"status": "reason_too_long", "max": 200}, status=400)
    r = _my_referral(request, apnt_id)
    if not r:
        return Response({"status": "not_found"}, status=404)
    if r["patient_status"] == "cancelled":
        return Response({"status": "already_cancelled"}, status=409)
    run("UPDATE referral_appointment SET pat_cancel_reason=%s, patient_status='cancelled' WHERE apnt_id=%s", [reason, apnt_id])
    mailer.send(mailer.doctor_email(r["referrer_doc_id"]), "Patient cancelled the referral", "Referral cancelled",
                [f"Patient {r['patient_id']} cancelled the referral request {apnt_id}.", f"Reason: {mailer.e(reason)}"])
    return Response({"status": "cancelled"})


@api_view(["POST"])
@permission_classes([IsPatient])
def book_referral(request, apnt_id):
    """Java referredAppointmentBooking: once the patient AND the referred doctor accepted, book a slot of
    the referred doctor (type 'referral', symptoms copied from the original visit) and delete the referral row."""
    r = _my_referral(request, apnt_id)
    if not r:
        return Response({"status": "not_found"}, status=404)
    if r["patient_status"] != "accepted" or r["referred_doc_status"] != "accepted":
        return Response({"status": "not_ready", "patient_status": r["patient_status"], "doctor_status": r["referred_doc_status"]}, status=409)
    orig = one("SELECT symptoms_list FROM appointment WHERE appointmentid=%s", [apnt_id]) or {}
    date_s, time_s = str(request.data.get("date", "")).strip(), str(request.data.get("time", "")).strip()
    if not (date_s and time_s):
        return Response({"status": "missing_fields"}, status=400)
    with transaction.atomic():
        ok, code, new_id = service.create(r["patient_id"], r["referred_doc_id"], date_s, time_s, orig.get("symptoms_list") or "", "referral")
        if not ok:
            return Response({"status": code}, status=BOOK_ERR.get(code, 400))
        run("DELETE FROM referral_appointment WHERE apnt_id=%s", [apnt_id])
    notify.booked(new_id)
    return Response({"status": "booked", "appointment_id": new_id}, status=201)


# ======================= change requests (staff edits need patient approval) =======================
PATIENT_COLUMNS = {"fname", "mname", "lname", "dob", "age", "gender", "marital", "address", "city", "state", "country", "zipcode", "mobno",
                   "hphone", "emergencycontact", "email", "bloodgroup", "insurance_provider", "govtidtype", "govtidno", "family_history",
                   "past_history", "drug_history", "social_history"}
NUMERIC = {"age", "mobno", "emergencycontact", "zipcode"}


@api_view(["POST"])
@permission_classes([IsPatient])
def respond_change(request, notification_id):
    """Java respondPatientChange: APPROVE applies the stored payload to the patient record (like
    updateUserDetails) and logs an INFO notification; REJECT leaves the record unchanged."""
    me = _me(request)
    decision = str(request.data.get("decision", "")).strip().upper()
    if decision not in ("APPROVE", "REJECT"):
        return Response({"status": "invalid_decision"}, status=400)
    with transaction.atomic():
        n = one("SELECT * FROM patient_notifications WHERE id=%s AND patient_id=%s AND type='CHANGE_REQUEST' FOR UPDATE", [notification_id, me])
        if not n:
            return Response({"status": "not_found"}, status=404)
        if n["status"] != "PENDING":
            return Response({"status": "already_decided", "current": n["status"], "message": f"This request is already {n['status'].lower()}."}, status=409)
        from hospital.patients import pending_path
        pending = pending_path(me)
        if decision == "REJECT":
            run("UPDATE patient_notifications SET status='REJECTED', decided_at=NOW(), is_read=1 WHERE id=%s", [notification_id])
            if pending.exists():
                pending.unlink()
            return Response({"status": "rejected", "message": "Change request rejected. Your details were not changed."})
        try:
            payload = json.loads(n["proposed_payload"] or "{}")
        except ValueError:
            payload = {}
        fields = {k: v for k, v in payload.items() if k in PATIENT_COLUMNS}
        new_file = pending.read_bytes() if pending.exists() and '"govtidfile"' in (n["details"] or "") else None
        if not fields and not new_file:
            return Response({"status": "nothing_to_apply"}, status=400)
        sets, vals = [], []
        for k, v in fields.items():
            v = None if v in ("", None) and k in NUMERIC else ("" if v is None else v)
            sets.append(f"{k}=%s")
            vals.append(v)
        if new_file:                      # legacy: <id>_pending.pdf renamed to <id>.pdf after approval
            sets.append("govtidfile=%s")
            vals.append(new_file)
        run("UPDATE patient SET " + ", ".join(sets) + " WHERE permanentid=%s", vals + [me])
        if pending.exists():
            pending.unlink()
        run("UPDATE patient_notifications SET status='APPROVED', decided_at=NOW(), is_read=1 WHERE id=%s", [notification_id])
        details = []
        try:
            details = [{k: x.get(k) for k in ("label", "old", "new")} for x in json.loads(n["details"] or "[]")]
        except ValueError:
            pass
        run("INSERT INTO patient_notifications (patient_id, title, message, details, type, status, changed_by, changed_by_name, changed_role) "
            "VALUES (%s,%s,%s,%s,'INFO','NONE',%s,%s,%s)",
            [me, "Your details were updated", "Your details were updated after you approved the request.", json.dumps(details),
             n["changed_by"], n["changed_by_name"], n["changed_role"]])
    return Response({"status": "approved", "message": "Approved. Your details have been updated."})


# ======================= dashboard extras =======================
@api_view(["GET"])
@permission_classes([IsPatient])
def today(request):
    """Java listCurrentDatePatientAppointments + listCurrentDateChildAppointments."""
    me = _me(request)
    t = date.today().isoformat()
    return Response({
        "self": rows(f"SELECT {APPT_COLS} FROM appointment WHERE permanentid=%s AND date_of_booking=%s ORDER BY time_of_booking", [me, t]),
        "children": rows(f"SELECT a.{APPT_COLS.replace(', ', ', a.')} FROM appointment a JOIN child_reg c ON c.child_id=a.permanentid "
                         "WHERE c.parent_id=%s AND a.date_of_booking=%s ORDER BY a.time_of_booking", [me, t]),
        "validated": is_validated(me),
    })


@api_view(["GET"])
@permission_classes([IsPatient])
def govtid_file(request):
    r = one("SELECT govtidfile f FROM patient WHERE permanentid=%s", [_me(request)])
    return file_response((r or {}).get("f"), "govt-id")
