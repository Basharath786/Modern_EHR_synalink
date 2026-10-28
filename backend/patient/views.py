"""Patient portal APIs (Phase 2). Every query is scoped to the logged-in patient's ID."""
import json

from django.conf import settings
from django.http import HttpResponse
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.authn import IsPatient
from booking import notify

from .access import require_validated

from .db import one, rows, run

UPCOMING = ("consult", "consult-rescheduled", "followup", "followup-rescheduled", "referral", "referral-rescheduled")
CLOSED = ("completed", "cancelled", "dns", "referral_appointment")


def _pid(request):
    """The logged-in patient, or one of their children when ?for=CHILDxxxx (Java 'Child' tabs)."""
    target = str(request.GET.get("for") or (request.data.get("for") if hasattr(request.data, "get") else "") or "").strip().upper()
    me = request.user.permanent_id
    if not target or target == me:
        return me
    if target.startswith("CHILD") and one("SELECT 1 x FROM child_reg WHERE child_id=%s AND parent_id=%s", [target, me]):
        return target
    raise NotFound("child_not_found")


def _email_of(pid):
    if pid.upper().startswith("CHILD"):
        c = one("SELECT email, parent_id FROM child_reg WHERE child_id=%s", [pid]) or {}
        return c.get("email") or (one("SELECT email FROM patient WHERE permanentid=%s", [c.get("parent_id")]) or {}).get("email") or ""
    return (one("SELECT email FROM patient WHERE permanentid=%s", [pid]) or {}).get("email") or ""


def _sniff(data: bytes):
    if data[:4] == b"%PDF":
        return "application/pdf", "pdf"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", "png"
    return "application/octet-stream", "bin"


# ---------- dashboard / profile ----------
@api_view(["GET"])
@permission_classes([IsPatient])
def dashboard(request):
    pid = _pid(request)
    by_type = {r["appointment_type"] or "": r["n"] for r in rows(
        "SELECT appointment_type, COUNT(*) n FROM appointment WHERE permanentid=%s GROUP BY appointment_type", [pid])}
    nxt = rows("SELECT appointmentid, doctor_name, hospital_name, deptname, date_of_booking, time_of_booking "
               "FROM appointment WHERE permanentid=%s AND appointment_type IN %s AND DATE(date_of_booking) >= CURDATE() "
               "ORDER BY date_of_booking, time_of_booking LIMIT 3", [pid, UPCOMING])
    return Response({
        "appointments": {
            "upcoming": sum(by_type.get(t, 0) for t in UPCOMING),
            "completed": by_type.get("completed", 0),
            "cancelled": by_type.get("cancelled", 0),
            "missed": by_type.get("dns", 0),
            "total": sum(by_type.values()),
        },
        "next_appointments": nxt,
        "active_problems": one("SELECT COUNT(*) n FROM patient_problems WHERE patient_id=%s AND status='ACTIVE'", [pid])["n"],
        "active_allergies": one("SELECT COUNT(*) n FROM patient_add_allergies WHERE patient_id=%s AND status='ACTIVE'", [pid])["n"],
        "vaccinations": one("SELECT COUNT(*) n FROM patient_vaccination WHERE patient_id=%s", [pid])["n"],
        "pending_lab_orders": one("SELECT COUNT(*) n FROM lab_order WHERE patient_id=%s AND status<>'COMPLETED'", [pid])["n"],
        "unread_notifications": one("SELECT COUNT(*) n FROM patient_notifications WHERE patient_id=%s AND is_read=0", [pid])["n"],
    })


@api_view(["GET"])
@permission_classes([IsPatient])
def profile(request):
    p = one("SELECT permanentid, fname, mname, lname, dob, age, gender, marital, address, city, state, country, zipcode, "
            "mobno, hphone, emergencycontact, email, bloodgroup, insurance_provider, govtidtype, govtidno, "
            "family_history, past_history, drug_history, social_history, date_time AS registered_on "
            "FROM patient WHERE permanentid=%s", [_pid(request)])
    return Response({"profile": p}) if p else Response({"status": "not_found"}, status=404)


# ---------- appointments ----------
@api_view(["GET"])
@permission_classes([IsPatient])
def appointments(request):
    pid = _pid(request)
    # Same rule as Java updateAllAppointmentsStatus(): past, unfinished appointments become 'dns' (missed)
    run("UPDATE appointment SET appointment_type='dns' WHERE permanentid=%s AND DATE(date_of_booking) < CURDATE() "
        "AND appointment_type NOT IN ('completed','cancelled','dns','referral_appointment')", [pid])
    items = rows("SELECT appointmentid, doctorid, doctor_name, hospital_id, hospital_name, deptname, date_of_booking, "
                 "time_of_booking, appointment_type, pat_cancel_reason, cancelled_by, rescheduled_by, symptoms_list, date_time "
                 "FROM appointment WHERE permanentid=%s ORDER BY date_time DESC", [pid])
    return Response({"appointments": items})


@api_view(["POST"])
@permission_classes([IsPatient])
def cancel_appointment(request, appointment_id):
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 30:  # appointment.pat_cancel_reason is varchar(30)
        return Response({"status": "reason_too_long", "max": 30}, status=400)
    appt = one("SELECT appointment_type FROM appointment WHERE appointmentid=%s AND permanentid=%s", [appointment_id, _pid(request)])
    if not appt:
        return Response({"status": "not_found"}, status=404)
    if appt["appointment_type"] in CLOSED:
        return Response({"status": "not_cancellable", "current": appt["appointment_type"]}, status=409)
    # Same update as Java patientCancelAppointment()
    run("UPDATE appointment SET pat_cancel_reason=%s, cancelled_by='PATIENT', patient_status='cancelled', "
        "appointment_type='cancelled' WHERE appointmentid=%s AND permanentid=%s", [reason, appointment_id, _pid(request)])
    notify.cancelled(appointment_id, reason, "patient")
    return Response({"status": "cancelled"})


# ---------- allergies ----------
@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def allergies(request):
    pid = _pid(request)
    return Response({
        "self_reported": rows("SELECT allergy_name, allergies_severity, allergies_description, status, date_time "
                              "FROM patient_add_allergies WHERE patient_id=%s ORDER BY date_time DESC", [pid]),
        "doctor_recorded": rows("SELECT apnt_id, allergy_name, allergies_severity, allergies_description, status, date_time "
                                "FROM patient_allergies WHERE patient_id=%s ORDER BY date_time DESC", [pid]),
    })


@api_view(["POST"])
@permission_classes([IsPatient])
@require_validated
def add_allergy(request):
    d = request.data
    name, sev, desc = (str(d.get(k, "")).strip() for k in ("allergy_name", "allergies_severity", "allergies_description"))
    if not name or not sev:
        return Response({"status": "missing_fields"}, status=400)
    if len(name) > 45 or len(sev) > 45 or len(desc) > 50:
        return Response({"status": "too_long", "limits": {"allergy_name": 45, "allergies_description": 50}}, status=400)
    pid = _pid(request)
    email = _email_of(pid)[:40]
    run("INSERT INTO patient_add_allergies (patient_id, patient_email, allergy_name, allergies_severity, allergies_description) "
        "VALUES (%s,%s,%s,%s,%s)", [pid, email, name, sev, desc])
    return Response({"status": "added"}, status=201)


@api_view(["POST"])
@permission_classes([IsPatient])
@require_validated
def set_allergy_status(request):
    d = request.data
    status = str(d.get("status", "")).strip()
    if status.upper() not in ("ACTIVE", "INACTIVE"):
        return Response({"status": "invalid_status"}, status=400)
    n = run("UPDATE patient_add_allergies SET status=%s, date_time=NOW() WHERE patient_id=%s AND allergy_name=%s AND allergies_severity=%s",
            [status.capitalize() if status.upper() == "INACTIVE" else "ACTIVE", _pid(request), d.get("allergy_name", ""), d.get("allergies_severity", "")])
    return Response({"status": "updated" if n else "not_found"}, status=200 if n else 404)


# ---------- vaccinations ----------
@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def vaccinations(request):
    return Response({"vaccinations": rows(
        "SELECT vaccine_name, dose_no, vaccination_date, date, (vaccination_file IS NOT NULL) AS has_file "
        "FROM patient_vaccination WHERE patient_id=%s ORDER BY date DESC, vaccine_name", [_pid(request)])})


@api_view(["POST"])
@permission_classes([IsPatient])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@require_validated
def add_vaccination(request):
    d = request.data
    name, dose, vdate = (str(d.get(k, "")).strip() for k in ("vaccine_name", "dose_no", "vaccination_date"))
    if not (name and dose and vdate):
        return Response({"status": "missing_fields"}, status=400)
    if len(name) > 45 or len(dose) > 45:
        return Response({"status": "too_long"}, status=400)
    blob = None
    f = request.FILES.get("file")
    if f:
        if f.size > settings.MAX_UPLOAD_BYTES:
            return Response({"status": "file_too_large", "max_mb": settings.MAX_UPLOAD_BYTES // 1048576}, status=413)
        blob = f.read()
        if _sniff(blob)[1] == "bin":
            return Response({"status": "unsupported_file", "allowed": ["pdf", "jpg", "png"]}, status=415)
    pid = _pid(request)
    email = _email_of(pid)[:45]
    run("INSERT INTO patient_vaccination (patient_id, patient_email, vaccine_name, dose_no, vaccination_date, vaccination_file, date) "
        "VALUES (%s,%s,%s,%s,%s,%s,CURDATE())", [pid, email, name, dose, vdate, blob])
    return Response({"status": "added"}, status=201)


@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def vaccination_file(request):
    r = one("SELECT vaccination_file FROM patient_vaccination WHERE patient_id=%s AND vaccine_name=%s AND dose_no=%s "
            "AND vaccination_file IS NOT NULL LIMIT 1", [_pid(request), request.GET.get("vaccine_name", ""), request.GET.get("dose_no", "")])
    if not r:
        return Response({"status": "not_found"}, status=404)
    data = bytes(r["vaccination_file"]); ctype, ext = _sniff(data)
    resp = HttpResponse(data, content_type=ctype)
    resp["Content-Disposition"] = f'inline; filename="vaccination.{ext}"'
    return resp


# ---------- clinical records ----------
@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def problems(request):
    return Response({"problems": rows("SELECT apnt_id, pat_problems, status, date_time FROM patient_problems "
                                      "WHERE patient_id=%s ORDER BY date_time DESC", [_pid(request)])})


@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def medications(request):
    return Response({"medications": rows(
        "SELECT apnt_id, order_id, medicine_name, medicine_quantity, medicine_duration, medicine_usage, medicine_instructions, "
        "repeat_medicine, number_of_days, date FROM patient_medicines WHERE patient_id=%s ORDER BY date DESC, order_id DESC", [_pid(request)])})


@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def lab_orders(request):
    return Response({"lab_orders": rows(
        "SELECT labname, apnt_id, order_id, lab_test_name, repeat_test, emergency_test, status, lab_cancel_reason, date_time, "
        "(report_file IS NOT NULL) AS has_report FROM lab_order WHERE patient_id=%s ORDER BY date_time DESC", [_pid(request)])})


@api_view(["GET"])
@permission_classes([IsPatient])
@require_validated
def lab_report(request):
    r = one("SELECT report_file FROM lab_order WHERE patient_id=%s AND apnt_id=%s AND order_id=%s AND report_file IS NOT NULL",
            [_pid(request), request.GET.get("apnt_id", ""), request.GET.get("order_id", "0")])
    if not r:
        return Response({"status": "not_found"}, status=404)
    data = bytes(r["report_file"]); ctype, ext = _sniff(data)
    resp = HttpResponse(data, content_type=ctype)
    resp["Content-Disposition"] = f'inline; filename="lab-report.{ext}"'
    return resp


# ---------- notifications ----------
@api_view(["GET"])
@permission_classes([IsPatient])
def notifications(request):
    items = rows("SELECT id, title, message, details, type, status, changed_by_name, changed_role, is_read, created_at "
                 "FROM patient_notifications WHERE patient_id=%s ORDER BY created_at DESC LIMIT 100", [_pid(request)])
    for it in items:
        try:
            it["details"] = json.loads(it["details"]) if it["details"] else None
        except ValueError:
            it["details"] = None
    return Response({"unread_count": sum(1 for i in items if not i["is_read"]), "notifications": items})


@api_view(["POST"])
@permission_classes([IsPatient])
def mark_notifications_read(request):
    nid = request.data.get("id")
    if nid:
        run("UPDATE patient_notifications SET is_read=1 WHERE id=%s AND patient_id=%s", [nid, _pid(request)])
    else:
        run("UPDATE patient_notifications SET is_read=1 WHERE patient_id=%s AND is_read=0 AND type<>'CHANGE_REQUEST'", [_pid(request)])
    return Response({"status": "ok"})
