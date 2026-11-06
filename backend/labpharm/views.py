"""Laboratory portal, lab staff portal, pharmacy portal and pharmacy staff portal
(legacy webui/lab-portal, lab-staff-portal, pharmacy-portal, pharmacy-staff-portal).

Legacy endpoints replaced:
  orders      : labOrderCount, listUniqueLabOrders, listAllLabOrders, statusUpdateForSingleLabOrder,
                statusUpdateForAllLabOrder, uploadLabReportFileToDb / ...ToLocation, downloadLabReportFile,
                pharmacyOrdersCount, listUniquePharmacyOrders, listAllPharmacyOrders,
                updateStatusForPharmacyOrders, updateAllStatusForPharmacyOrders
  staff       : labStaffCount / pharmacyStaffCount, listLabStaffsSummery / listPharmacyStaffsSummery,
                register (LAB_STAFF / PHARMACY_STAFF), approve, listAllDetails, downloadImage
  affiliation : labRequestAffiliationWithHospital / pharmacyRequestAffiliationWithHospital,
                listOfPendingRequestsFrom{Lab,Pharmacy}ToHospital, pendingHospitalWith{Lab,Pharmacy},
                {lab,pharmacy}ConfirmsAffiliation, {lab,pharmacy}CancelAffiliation,
                listOfHospitalRejectedBy{Lab,Pharmacy}, hospitalsAffiliatedWithLab / hospitalAffiliatedWithPharmacy
  profile     : listAllDetails + downloadImage for the lab / pharmacy / staff member

Order status flow (same strings as the legacy tables):
  lab_order.status            PENDING -> AWAITING (confirmed) -> PROCESSING (sample taken) -> COMPLETED (report uploaded)
                              cancel at each step: CONFIRMATION-CANCELLED / AWAITING-CANCELLED / PROCESSING-CANCELLED
  pharmacy_orders.confirmation_status   PENDING -> CONFIRMED -> COMPLETED (delivered)
                              cancel: CANCELLED (from PENDING) / CONFIRMATION-CANCELLED (from CONFIRMED)"""
from django.db import transaction
from django.http import HttpResponse
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsOrgAdmin, IsOrgUser
from accounts.crypto import encrypt_password
from accounts.db import one, rows, run
from accounts.entities import Form, blob, detail, file_field, new_id, random_password
from accounts.setpw import approval_mail
from hospital.affiliation import split_ids
from patient.files import file_response, sniff

ORG = {
    #            org table  name col         email col          order table        org col in orders  status col               staff table       staff org col  staff prefix
    "lab": dict(table="lab", name="labname", email="labemail", orders="lab_order", org_col="labid", status="status",
                staff="lab_staff", staff_org="labid", staff_name_col="labname", prefix="LBST", req_col="labid",
                item="lab_test_name", reason="lab_cancel_reason", label="Laboratory"),
    "pharmacy": dict(table="pharmacy", name="pharmacy_name", email="pharmacy_email", orders="pharmacy_orders", org_col="pharmacy_id",
                     status="confirmation_status", staff="pharmacy_staff", staff_org="pharmacy_id", staff_name_col="pharmacy_name",
                     prefix="PHST", req_col="pharmacy_id", item="medicine_name", reason="order_cancel_reason", label="Pharmacy"),
}
ROLE_KIND = {"LAB": "lab", "LAB_STAFF": "lab", "PHARMACY": "pharmacy", "PHARMACY_STAFF": "pharmacy"}

# from-status -> {action: to-status}
FLOW = {
    "lab": {"PENDING": {"confirm": "AWAITING", "cancel": "CONFIRMATION-CANCELLED"},
            "AWAITING": {"collect": "PROCESSING", "cancel": "AWAITING-CANCELLED"},
            "PROCESSING": {"complete": "COMPLETED", "cancel": "PROCESSING-CANCELLED"}},
    "pharmacy": {"PENDING": {"confirm": "CONFIRMED", "cancel": "CANCELLED"},
                 "CONFIRMED": {"complete": "COMPLETED", "cancel": "CONFIRMATION-CANCELLED"}},
}
STATUS_TEXT = {"AWAITING": "CONFIRMED - awaiting sample collection", "PROCESSING": "under PROCESSING", "COMPLETED": "COMPLETED",
               "CONFIRMED": "CONFIRMED", "CANCELLED": "CANCELLED", "CONFIRMATION-CANCELLED": "CANCELLED",
               "AWAITING-CANCELLED": "CANCELLED", "PROCESSING-CANCELLED": "CANCELLED"}


def org_of(request):
    """(kind, org id) of the logged-in lab / pharmacy admin or staff member."""
    role, pid = request.user.role, request.user.permanent_id
    kind = ROLE_KIND[role]
    if role in ("LAB", "PHARMACY"):
        return kind, pid
    c = ORG[kind]
    r = one(f"SELECT {c['staff_org']} AS o FROM {c['staff']} WHERE permanentid=%s", [pid]) or {}
    return kind, r.get("o")


def _org_row(kind, oid):
    c = ORG[kind]
    return one(f"SELECT permanentid, {c['name']} AS name, {c['email']} AS email, address, land_phone, affiliated_hospital_list "
               f"FROM {c['table']} WHERE permanentid=%s", [oid]) or {}


# ====================================================================== dashboard / profile
@api_view(["GET"])
@permission_classes([IsOrgUser])
def dashboard(request):
    kind, oid = org_of(request)
    c = ORG[kind]
    org = _org_row(kind, oid)
    # legacy labOrderCount / pharmacyOrdersCount: count(DISTINCT status, order_id) per status
    counts = {r["s"]: r["n"] for r in rows(f"SELECT {c['status']} AS s, COUNT(DISTINCT order_id) n FROM {c['orders']} "
                                            f"WHERE {c['org_col']}=%s GROUP BY {c['status']}", [oid])}
    out = {"kind": kind, "org": {"permanentid": oid, "name": org.get("name")}, "orders": counts,
           "staff": one(f"SELECT COUNT(*) n FROM {c['staff']} WHERE {c['staff_org']}=%s", [oid])["n"],
           "today": one(f"SELECT COUNT(DISTINCT order_id) n FROM {c['orders']} WHERE {c['org_col']}=%s AND DATE(date_time)=CURDATE()", [oid])["n"],
           "affiliated_hospitals": len(split_ids(org.get("affiliated_hospital_list")))}
    if request.user.role in ("LAB", "PHARMACY"):
        out["pending_staff"] = one(f"SELECT COUNT(*) n FROM {c['staff']} WHERE {c['staff_org']}=%s AND status='PENDING'", [oid])["n"]
        out["incoming_affiliations"] = one(f"SELECT COUNT(*) n FROM affiliation_request WHERE {c['req_col']}=%s AND request_to=%s "
                                           "AND status='request-sent'", [oid, kind])["n"]
    return Response(out)


@api_view(["GET"])
@permission_classes([IsOrgUser])
def profile(request):
    kind, oid = org_of(request)
    role = request.user.role
    if role in ("LAB", "PHARMACY"):
        return Response({"kind": kind, "item": detail(kind, oid), "files": {"panimage": "PAN card", "civilimage": "Civil reg. / D.L. proof"}})
    staff_kind = "lab_staff" if kind == "lab" else "pharmacy_staff"
    return Response({"kind": kind, "item": detail(staff_kind, request.user.permanent_id), "org": _org_row(kind, oid).get("name"),
                     "files": {"govtidfile": "Govt ID proof"}})


@api_view(["GET"])
@permission_classes([IsOrgUser])
def profile_file(request, col):
    kind, oid = org_of(request)
    if request.user.role in ("LAB", "PHARMACY"):
        return file_response(blob(kind, oid, col), f"{oid}_{col}")
    staff_kind = "lab_staff" if kind == "lab" else "pharmacy_staff"
    return file_response(blob(staff_kind, request.user.permanent_id, col), f"{request.user.permanent_id}_{col}")


# ====================================================================== orders
def _order_header(kind, oid, order_id):
    c = ORG[kind]
    return one(f"SELECT o.order_id, o.apnt_id, o.patient_id, o.patient_email, MIN(o.date_time) AS date_time, "
               f"a.fullname, a.doctorid, a.doctor_name, a.deptname, a.hospital_id, a.hospital_name, a.date_of_booking, a.time_of_booking, "
               f"p.mobno, p.gender, p.age FROM {c['orders']} o LEFT JOIN appointment a ON a.appointmentid=o.apnt_id "
               f"LEFT JOIN patient p ON p.permanentid=o.patient_id WHERE o.{c['org_col']}=%s AND o.order_id=%s "
               f"GROUP BY o.order_id, o.apnt_id, o.patient_id, o.patient_email, a.fullname, a.doctorid, a.doctor_name, a.deptname, "
               f"a.hospital_id, a.hospital_name, a.date_of_booking, a.time_of_booking, p.mobno, p.gender, p.age", [oid, order_id])


def _items(kind, oid, order_id):
    c = ORG[kind]
    if kind == "lab":
        return rows("SELECT lab_test_name AS name, repeat_test, emergency_test, status, lab_cancel_reason AS reason, date_time, "
                    "(report_file IS NOT NULL AND LENGTH(report_file)>0) AS has_report FROM lab_order WHERE labid=%s AND order_id=%s "
                    "ORDER BY lab_test_name", [oid, order_id])
    return rows("SELECT medicine_name AS name, medicine_quantity, medicine_duration, medicine_usage, medicine_instructions, repeat_medicine, "
                "number_of_days, confirmation_status AS status, order_cancel_reason AS reason, date_time FROM pharmacy_orders "
                "WHERE pharmacy_id=%s AND order_id=%s ORDER BY medicine_name", [oid, order_id])


@api_view(["GET"])
@permission_classes([IsOrgUser])
def orders(request):
    """Legacy listUniqueLabOrders / listUniquePharmacyOrders, grouped per order with a status summary."""
    kind, oid = org_of(request)
    c = ORG[kind]
    data = rows(f"SELECT o.order_id, o.apnt_id, o.patient_id, o.{c['status']} AS status, o.date_time, a.fullname, a.doctor_name, a.hospital_name "
                + (", o.emergency_test" if kind == "lab" else ", NULL AS emergency_test") +
                f" FROM {c['orders']} o LEFT JOIN appointment a ON a.appointmentid=o.apnt_id WHERE o.{c['org_col']}=%s ORDER BY o.date_time DESC", [oid])
    grouped = {}
    for r in data:
        g = grouped.setdefault(r["order_id"], {"order_id": r["order_id"], "apnt_id": r["apnt_id"], "patient_id": r["patient_id"], "fullname": r["fullname"],
                                               "doctor_name": r["doctor_name"], "hospital_name": r["hospital_name"], "date_time": r["date_time"],
                                               "emergency": False, "statuses": {}, "items": 0})
        g["statuses"][r["status"]] = g["statuses"].get(r["status"], 0) + 1
        g["items"] += 1
        g["emergency"] = g["emergency"] or (str(r["emergency_test"] or "").upper() == "YES")
    return Response({"kind": kind, "orders": list(grouped.values())})


@api_view(["GET"])
@permission_classes([IsOrgUser])
def order_detail(request, order_id):
    kind, oid = org_of(request)
    h = _order_header(kind, oid, order_id)
    if not h:
        return Response({"status": "not_found"}, status=404)
    return Response({"kind": kind, "order": h, "items": _items(kind, oid, order_id), "flow": FLOW[kind]})


def _notify(kind, oid, order_id, names, new_status, reason):
    """Patient + lab/pharmacy admin mails (legacy labNotificationToPatient, notificationToLabAdmin, confirmationNotificationToPatient ...)."""
    org = _org_row(kind, oid)
    h = _order_header(kind, oid, order_id) or {}
    what = "Lab test(s)" if kind == "lab" else "Medicine(s)"
    lines = [f"Order ID: <b>{order_id}</b> · Appointment ID: <b>{mailer.e(h.get('apnt_id'))}</b>",
             f"{what}: <b>{mailer.e(', '.join(names))}</b>", f"Status: <b>{STATUS_TEXT.get(new_status, new_status)}</b>"]
    if reason:
        lines.append(f"Reason for cancellation: <b>{mailer.e(reason)}</b>")
    lines += [f"Doctor: {mailer.e(h.get('doctor_name'))} ({mailer.e(h.get('doctorid'))}), {mailer.e(h.get('deptname'))}",
              f"Hospital: {mailer.e(h.get('hospital_name'))} ({mailer.e(h.get('hospital_id'))})",
              f"{ORG[kind]['label']}: {mailer.e(org.get('name'))} ({oid}) · {mailer.e(org.get('land_phone'))} · {mailer.e(org.get('address'))}"]
    if kind == "lab" and new_status == "COMPLETED":
        lines.append("Your report is available under Lab Orders in the patient portal.")
    subject = "Lab Order Details" if kind == "lab" else "Pharmacy Order Details"
    mailer.send(h.get("patient_email") or mailer.patient_email(h.get("patient_id")), subject, f"Dear {h.get('fullname') or 'Patient'} ({h.get('patient_id')}),", lines)
    mailer.send(org.get("email"), subject, f"Order {order_id} updated", [f"Patient: {mailer.e(h.get('fullname'))} ({mailer.e(h.get('patient_id'))})"] + lines)


@api_view(["POST"])
@permission_classes([IsOrgUser])
def order_status(request, order_id):
    """Body: {action: confirm|collect|complete|cancel, from_status, items: [names] (optional = every item in from_status), reason}."""
    kind, oid = org_of(request)
    c = ORG[kind]
    action = str(request.data.get("action", "")).strip().lower()
    src = str(request.data.get("from_status", "")).strip().upper()
    names = request.data.get("items") or []
    reason = str(request.data.get("reason", "")).strip()
    to = FLOW[kind].get(src, {}).get(action)
    if not to:
        return Response({"status": "invalid_transition"}, status=400)
    if kind == "lab" and to == "COMPLETED":
        return Response({"status": "upload_report", "message": "Upload the report to complete a lab test."}, status=400)
    if action == "cancel" and not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 300:
        return Response({"status": "reason_too_long", "max": 300}, status=400)
    current = [i for i in _items(kind, oid, order_id) if i["status"] == src]
    if not current:
        return Response({"status": "not_found"}, status=404)
    chosen = [i["name"] for i in current if not names or i["name"] in names]
    if not chosen:
        return Response({"status": "select_items"}, status=400)
    with transaction.atomic():
        for n in chosen:
            run(f"UPDATE {c['orders']} SET {c['status']}=%s, {c['reason']}=%s WHERE {c['org_col']}=%s AND order_id=%s AND {c['item']}=%s AND {c['status']}=%s",
                [to, reason or None, oid, order_id, n, src])
    _notify(kind, oid, order_id, chosen, to, reason)
    return Response({"status": "updated", "to": to, "items": _items(kind, oid, order_id)})


@api_view(["POST"])
@permission_classes([IsOrgUser])
@parser_classes([MultiPartParser, FormParser])
def lab_report_upload(request, order_id):
    """Legacy uploadLabReportFileToDb: stores the report and marks the test COMPLETED (only from PROCESSING)."""
    kind, oid = org_of(request)
    if kind != "lab":
        return Response({"status": "not_found"}, status=404)
    name = str(request.data.get("lab_test_name", ""))
    data, err = file_field(request, "report_file", "Report file", max_bytes=10 * 1024 * 1024)
    if err:
        return Response({"status": "invalid_file", "message": err}, status=400)
    n = run("UPDATE lab_order SET report_file=%s, status='COMPLETED', lab_cancel_reason=NULL WHERE labid=%s AND order_id=%s AND lab_test_name=%s "
            "AND status IN ('PROCESSING','COMPLETED')", [data, oid, order_id, name])
    if not n:
        return Response({"status": "not_processing", "message": "Collect the sample (PROCESSING) before uploading the report."}, status=409)
    _notify(kind, oid, order_id, [name], "COMPLETED", None)
    return Response({"status": "uploaded", "items": _items(kind, oid, order_id)})


@api_view(["GET"])
@permission_classes([IsOrgUser])
def lab_report_download(request, order_id):
    kind, oid = org_of(request)
    r = one("SELECT report_file f FROM lab_order WHERE labid=%s AND order_id=%s AND lab_test_name=%s", [oid, order_id, request.GET.get("test", "")]) if kind == "lab" else None
    if not r or not r["f"]:
        return Response({"status": "not_found"}, status=404)
    data = bytes(r["f"])
    ctype, ext = sniff(data)
    resp = HttpResponse(data, content_type=ctype)
    resp["Content-Disposition"] = f'inline; filename="report-{order_id}.{ext}"'
    return resp


# ====================================================================== staff (admin only)
SHORT = "permanentid, fname, dob, age, gender, mobno, email, jobtype, qualification, experience, status, date_time"


@api_view(["GET", "POST"])
@permission_classes([IsOrgAdmin])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def staff(request):
    kind, oid = org_of(request)
    c = ORG[kind]
    if request.method == "GET":
        items = rows(f"SELECT {SHORT} FROM {c['staff']} WHERE {c['staff_org']}=%s ORDER BY date_time DESC", [oid])
        for i in items:
            i["password_set"] = bool((one("SELECT pswrd FROM login WHERE permanentid=%s", [i["permanentid"]]) or {}).get("pswrd"))
        return Response({"items": items})
    f = Form(request.data)
    f.text("fname", "Full name", max_len=45, pattern=r"[A-Za-z ]+", msg="Name should contain only letters")
    f.dob(min_age=18)
    f.choice("gender", "Gender", ["Male", "Female", "Others"])
    f.choice("marital", "Marital status", ["single", "married", "widowed", "divorced"])
    f.text("address", "Address", max_len=60, pattern=r"[#.0-9A-Za-z\s,-]+", msg="Address can contain letters, numbers and # . , -")
    mob = f.mobile("mobno")
    f.email("email", "Email", max_len=40)
    f.choice("jobtype", "Job type", ["Full Time", "Part Time", "Consultant"])
    f.text("qualification", "Qualification", max_len=45, pattern=r"[A-Za-z .]+", msg="Qualification should contain only letters")
    f.number("experience", "Experience", required=False, max_value=99, default=0)
    f.govt_id()
    data, err = file_field(request, "govtidfile", "ID proof")
    if err:
        f.errors["govtidfile"] = err
    if mob and one(f"SELECT permanentid FROM {c['staff']} WHERE mobno=%s", [mob]):
        f.errors["mobno"] = "Mobile number already registered. Please use a different number."
    if f.errors:
        return f.response()
    v = f.clean
    org = _org_row(kind, oid)
    with transaction.atomic():
        pid = new_id(c["prefix"], c["staff"])
        run(f"INSERT INTO {c['staff']} (permanentid, pswrd, fname, dob, age, gender, marital, {c['staff_name_col']}, {c['staff_org']}, address, mobno, email, "
            "jobtype, qualification, experience, govtidtype, govtidno, govtidfile, status, date_time) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PENDING',NOW())",
            [pid, encrypt_password(random_password()), v["fname"], v["dob"], v["age"], v["gender"], v["marital"], (org.get("name") or "")[:25 if kind == "lab" else 50], oid,
             v["address"], v["mobno"], v["email"], v["jobtype"], v["qualification"], v["experience"], v["govtidtype"], v["govtidno"], data])
        run("INSERT INTO login (permanentid, pswrd, isdefault_password, systemLoginTime, pswrd_changed_time, failed_attempt, account_locked, lock_time) "
            "VALUES (%s,'','YES',NOW(),NOW(),0,'NO',0)", [pid])
    label = "LAB STAFF" if kind == "lab" else "PHARMACY STAFF"
    from accounts import whatsapp
    whatsapp.new_permanent_id(v["mobno"], v["fname"], pid)
    mailer.send(v["email"], f"{label} registration successful - Permanent ID: {pid}", "Registration successful", [
        f"Your {label} registration has been completed successfully.", f"Your Permanent ID: <b>{pid}</b>", "Status: <b style='color:#f59e0b'>PENDING APPROVAL</b>",
        f"Once {mailer.e(org.get('name'))} approves your account you will receive a link to set your password."])
    return Response({"status": "registered", "permanentid": pid,
                     "message": f"{label} registered successfully. Permanent ID: {pid}. Approve the account to send the set-password link."}, status=201)


def _my_staff(request, pid):
    kind, oid = org_of(request)
    c = ORG[kind]
    return kind, one(f"SELECT permanentid, email FROM {c['staff']} WHERE permanentid=%s AND {c['staff_org']}=%s", [pid, oid])


@api_view(["GET"])
@permission_classes([IsOrgAdmin])
def staff_detail(request, pid):
    kind, s = _my_staff(request, pid)
    if not s:
        return Response({"status": "not_found"}, status=404)
    lg = one("SELECT pswrd, systemLoginTime FROM login WHERE permanentid=%s", [pid]) or {}
    return Response({"item": detail("lab_staff" if kind == "lab" else "pharmacy_staff", pid), "password_set": bool(lg.get("pswrd")),
                     "last_login": lg.get("systemLoginTime") if lg.get("pswrd") else None})


@api_view(["GET"])
@permission_classes([IsOrgAdmin])
def staff_file(request, pid):
    kind, s = _my_staff(request, pid)
    if not s:
        return Response({"status": "not_found"}, status=404)
    return file_response(blob("lab_staff" if kind == "lab" else "pharmacy_staff", pid, "govtidfile"), f"{pid}_govtid")


@api_view(["POST"])
@permission_classes([IsOrgAdmin])
def staff_approve(request, pid):
    """Legacy v1/approve LAB_STAFF / PHARMACY_STAFF."""
    kind, s = _my_staff(request, pid)
    if not s:
        return Response({"status": "not_found"}, status=404)
    if not run(f"UPDATE {ORG[kind]['staff']} SET status='APPROVED', date_time=NOW() WHERE permanentid=%s AND status='PENDING'", [pid]):
        return Response({"status": "not_pending", "message": "Already approved."}, status=409)
    approval_mail(pid, "LAB STAFF" if kind == "lab" else "PHARMACY STAFF", s["email"])
    return Response({"status": "approved", "permanentid": pid})


# ====================================================================== affiliations (lab / pharmacy side)
def aff_state(kind, oid):
    c = ORG[kind]
    org = _org_row(kind, oid)
    affiliated = split_ids(org.get("affiliated_hospital_list"))
    req = rows(f"SELECT hospital_id AS pid, request_to, status, cancel_reason, date FROM affiliation_request WHERE {c['req_col']}=%s ORDER BY date DESC", [oid])
    ids = list({*affiliated, *[r["pid"] for r in req]})
    info = {r["permanentid"]: r for r in rows(
        f"SELECT permanentid, hospital_name AS name, address, city, state, hospital_email AS email, land_phone, administration_no FROM hospital "
        f"WHERE permanentid IN ({','.join(['%s'] * len(ids))})", ids)} if ids else {}
    pack = lambda r: {**(info.get(r["pid"]) or {"permanentid": r["pid"], "name": r["pid"]}), "date": r["date"], "cancel_reason": r["cancel_reason"]}
    busy = set(affiliated) | {r["pid"] for r in req if r["status"] == "request-sent"}
    return {
        "affiliated": [info.get(i) or {"permanentid": i, "name": i} for i in affiliated],
        "outgoing": [pack(r) for r in req if r["request_to"] == "hospital" and r["status"] == "request-sent"],
        "rejected_by_them": [pack(r) for r in req if r["request_to"] == "hospital" and r["status"] == "request-cancelled"],
        "incoming": [pack(r) for r in req if r["request_to"] == kind and r["status"] == "request-sent"],
        "rejected_by_me": [pack(r) for r in req if r["request_to"] == kind and r["status"] == "request-cancelled"],
        "available": [r for r in rows("SELECT permanentid, hospital_name AS name, address, city, state, hospital_email AS email, land_phone FROM hospital "
                                      "WHERE permanentid IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>'' ORDER BY hospital_name")
                      if r["permanentid"] not in busy],
    }


@api_view(["GET"])
@permission_classes([IsOrgAdmin])
def affiliations(request):
    kind, oid = org_of(request)
    return Response(aff_state(kind, oid))


def _names(kind, oid, hid):
    org = _org_row(kind, oid)
    h = one("SELECT hospital_name AS name, hospital_email AS email, affiliated_labs_list, affiliated_pharmacy_list FROM hospital WHERE permanentid=%s", [hid]) or {}
    return org, h


@api_view(["POST"])
@permission_classes([IsOrgAdmin])
def aff_request(request, hid):
    kind, oid = org_of(request)
    c = ORG[kind]
    if not one("SELECT permanentid FROM hospital WHERE permanentid=%s AND approved_by IS NOT NULL AND approved_by<>''", [hid]):
        return Response({"status": "not_found"}, status=404)
    st = aff_state(kind, oid)
    if hid in [x["permanentid"] for x in st["affiliated"]]:
        return Response({"status": "already_affiliated"}, status=409)
    if hid in [x["permanentid"] for x in st["outgoing"] + st["incoming"]]:
        return Response({"status": "already_requested"}, status=409)
    with transaction.atomic():
        run(f"DELETE FROM affiliation_request WHERE hospital_id=%s AND {c['req_col']}=%s AND status='request-cancelled'", [hid, oid])
        run(f"INSERT INTO affiliation_request (hospital_id, {c['req_col']}, request_to, status, date) VALUES (%s,%s,'hospital','request-sent',NOW())", [hid, oid])
    org, h = _names(kind, oid, hid)
    mailer.send(h.get("email"), "New affiliation request", "New affiliation request",
                [f"<b>{mailer.e(org.get('name'))}</b> ({oid}) wants to affiliate with your hospital.", "Open Labs & Pharmacies in the hospital portal to accept or reject it."])
    mailer.send(org.get("email"), "Affiliation request sent", "Affiliation request sent", [f"Request sent to <b>{mailer.e(h.get('name'))}</b> ({hid})."])
    return Response({"status": "requested", **aff_state(kind, oid)}, status=201)


def _append(table, col, where_id, add_id):
    r = one(f"SELECT {col} AS l FROM {table} WHERE permanentid=%s FOR UPDATE", [where_id]) or {}
    ids = split_ids(r.get("l"))
    if add_id not in ids:
        ids.append(add_id)
    run(f"UPDATE {table} SET {col}=%s WHERE permanentid=%s", [",".join(ids), where_id])


@api_view(["POST"])
@permission_classes([IsOrgAdmin])
def aff_accept(request, hid):
    """Legacy labConfirmsAffiliation / pharmacyConfirmsAffiliation (request_to = lab / pharmacy)."""
    kind, oid = org_of(request)
    c = ORG[kind]
    with transaction.atomic():
        if not one(f"SELECT 1 x FROM affiliation_request WHERE hospital_id=%s AND {c['req_col']}=%s AND request_to=%s AND status='request-sent' FOR UPDATE",
                   [hid, oid, kind]):
            return Response({"status": "not_found"}, status=404)
        _append(c["table"], "affiliated_hospital_list", oid, hid)
        _append("hospital", "affiliated_labs_list" if kind == "lab" else "affiliated_pharmacy_list", hid, oid)
        run(f"DELETE FROM affiliation_request WHERE hospital_id=%s AND {c['req_col']}=%s AND request_to=%s", [hid, oid, kind])
    org, h = _names(kind, oid, hid)
    mailer.send(h.get("email"), "Affiliation request accepted", "Affiliation accepted", [f"<b>{mailer.e(org.get('name'))}</b> ({oid}) accepted your affiliation request."])
    mailer.send(org.get("email"), "Affiliation confirmed", "Affiliation confirmed", [f"You are now affiliated with <b>{mailer.e(h.get('name'))}</b> ({hid})."])
    return Response({"status": "accepted", **aff_state(kind, oid)})


@api_view(["POST"])
@permission_classes([IsOrgAdmin])
def aff_reject(request, hid):
    """Legacy labCancelAffiliation / pharmacyCancelAffiliation (status request-cancelled + reason)."""
    kind, oid = org_of(request)
    c = ORG[kind]
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 300:
        return Response({"status": "reason_too_long", "max": 300}, status=400)
    if not run(f"UPDATE affiliation_request SET status='request-cancelled', date=NOW(), cancel_reason=%s WHERE hospital_id=%s AND {c['req_col']}=%s "
               "AND request_to=%s AND status='request-sent'", [reason, hid, oid, kind]):
        return Response({"status": "not_found"}, status=404)
    org, h = _names(kind, oid, hid)
    mailer.send(h.get("email"), "Affiliation request rejected", "Affiliation request rejected",
                [f"<b>{mailer.e(org.get('name'))}</b> ({oid}) rejected your affiliation request.", f"Reason: {mailer.e(reason)}"])
    return Response({"status": "rejected", **aff_state(kind, oid)})
