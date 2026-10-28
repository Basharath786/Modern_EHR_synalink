"""Doctor portal APIs (Phase 3A): dashboard, appointments, patient summary, slots (read-only)."""
from datetime import date, datetime

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.authn import IsDoctor
from accounts.db import one, rows, run
from booking import notify, service, slots

OPEN = ("consult", "consult-rescheduled", "followup", "followup-rescheduled", "referral", "referral-rescheduled")
COLS = ("appointmentid, permanentid, fullname, doctorid, doctor_name, hospital_id, hospital_name, deptname, date_of_booking, time_of_booking, "
        "appointment_type, pat_cancel_reason, cancelled_by, rescheduled_by, symptoms_list, date_time")


def _start(t):
    try:
        return datetime.strptime((t or "").split("-")[0].strip(), "%I:%M %p").time()
    except ValueError:
        return datetime.max.time()


def _sort(items, reverse=False):
    return sorted(items, key=lambda a: (a["date_of_booking"] or "", _start(a["time_of_booking"])), reverse=reverse)


def _mark_missed(doctor_id):   # Java updateAllAppointmentsStatus(), limited to this doctor
    run("UPDATE appointment SET appointment_type='dns' WHERE doctorid=%s AND DATE(date_of_booking) < CURDATE() "
        "AND appointment_type NOT IN ('completed','cancelled','dns','referral_appointment')", [doctor_id])


def _mine(request, appointment_id):
    return one(f"SELECT {COLS} FROM appointment WHERE appointmentid=%s AND doctorid=%s", [appointment_id, request.user.permanent_id])


@api_view(["GET"])
@permission_classes([IsDoctor])
def dashboard(request):
    me = request.user.permanent_id
    _mark_missed(me)
    today = date.today().isoformat()
    todays = _sort(rows(f"SELECT {COLS} FROM appointment WHERE doctorid=%s AND date_of_booking=%s", [me, today]))
    upcoming = one("SELECT COUNT(*) n FROM appointment WHERE doctorid=%s AND date_of_booking>%s AND appointment_type IN %s", [me, today, OPEN])["n"]
    return Response({
        "today": {"total": len([a for a in todays if a["appointment_type"] != "cancelled"]),
                  "completed": len([a for a in todays if a["appointment_type"] == "completed"]),
                  "waiting": len([a for a in todays if a["appointment_type"] in OPEN]),
                  "cancelled": len([a for a in todays if a["appointment_type"] == "cancelled"])},
        "upcoming": upcoming,
        "patients_seen": one("SELECT COUNT(DISTINCT permanentid) n FROM appointment WHERE doctorid=%s AND appointment_type='completed'", [me])["n"],
        "queue": [a for a in todays if a["appointment_type"] in OPEN][:8],
    })


@api_view(["GET"])
@permission_classes([IsDoctor])
def appointments(request):
    me = request.user.permanent_id
    _mark_missed(me)
    scope = request.GET.get("scope", "today")
    today = date.today().isoformat()
    if scope == "today":
        items = _sort(rows(f"SELECT {COLS} FROM appointment WHERE doctorid=%s AND date_of_booking=%s", [me, today]))
    elif scope == "upcoming":
        items = _sort(rows(f"SELECT {COLS} FROM appointment WHERE doctorid=%s AND date_of_booking>%s AND appointment_type IN %s", [me, today, OPEN]))
    elif scope == "past":
        items = _sort(rows(f"SELECT {COLS} FROM appointment WHERE doctorid=%s AND date_of_booking<%s", [me, today]), reverse=True)
    else:
        items = rows(f"SELECT {COLS} FROM appointment WHERE doctorid=%s ORDER BY date_time DESC", [me])
    return Response({"appointments": items})


@api_view(["GET"])
@permission_classes([IsDoctor])
def appointment_detail(request, appointment_id):
    a = _mine(request, appointment_id)
    if not a:
        return Response({"status": "not_found"}, status=404)
    return Response({"appointment": a, "patient": patient_summary(a["permanentid"])})


def patient_summary(pid):
    if pid.upper().startswith("CHILD"):     # children live in child_reg, linked to a parent patient
        prof = one("SELECT child_id AS permanentid, childfname AS fname, mname, lname, dob, age, gender, bloodgroup, "
                   "past_history, drug_history, parent_id FROM child_reg WHERE child_id=%s", [pid]) or {}
    else:
        prof = one("SELECT permanentid, fname, mname, lname, dob, age, gender, bloodgroup, marital, family_history, past_history, "
                   "drug_history, social_history FROM patient WHERE permanentid=%s", [pid]) or {}
    return {
        "profile": prof,
        "problems": rows("SELECT pat_problems, status, date_time FROM patient_problems WHERE patient_id=%s ORDER BY status='ACTIVE' DESC, date_time DESC LIMIT 20", [pid]),
        "allergies": rows("SELECT allergy_name, allergies_severity, status FROM patient_add_allergies WHERE patient_id=%s "
                          "UNION ALL SELECT allergy_name, allergies_severity, status FROM patient_allergies WHERE patient_id=%s", [pid, pid]),
        "flags": rows("SELECT pat_flags, status FROM patient_flags WHERE patient_id=%s ORDER BY date_time DESC", [pid]),
        "medications": rows("SELECT medicine_name, medicine_usage, medicine_duration, date FROM patient_medicines WHERE patient_id=%s ORDER BY date DESC LIMIT 10", [pid]),
        "vaccinations": rows("SELECT vaccine_name, dose_no, vaccination_date FROM patient_vaccination WHERE patient_id=%s ORDER BY date DESC LIMIT 10", [pid]),
    }


@api_view(["GET"])
@permission_classes([IsDoctor])
def patient_view(request, patient_id):
    # A doctor may only open patients they have an appointment with
    if not one("SELECT 1 x FROM appointment WHERE doctorid=%s AND permanentid=%s LIMIT 1", [request.user.permanent_id, patient_id]):
        return Response({"status": "forbidden"}, status=403)
    visits = rows(f"SELECT {COLS} FROM appointment WHERE doctorid=%s AND permanentid=%s ORDER BY date_time DESC", [request.user.permanent_id, patient_id])
    return Response({"patient": patient_summary(patient_id), "visits": visits})


@api_view(["POST"])
@permission_classes([IsDoctor])
def complete(request, appointment_id):
    a = _mine(request, appointment_id)
    if not a:
        return Response({"status": "not_found"}, status=404)
    if a["appointment_type"] not in OPEN:
        return Response({"status": "not_completable", "current": a["appointment_type"]}, status=409)
    if a["date_of_booking"] and a["date_of_booking"] > date.today().isoformat():
        return Response({"status": "future_appointment"}, status=409)
    run("UPDATE appointment SET appointment_type='completed' WHERE appointmentid=%s AND doctorid=%s", [appointment_id, request.user.permanent_id])
    return Response({"status": "completed"})


@api_view(["POST"])
@permission_classes([IsDoctor])
def cancel(request, appointment_id):
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 30:
        return Response({"status": "reason_too_long", "max": 30}, status=400)
    a = _mine(request, appointment_id)
    if not a:
        return Response({"status": "not_found"}, status=404)
    if not service.cancel(a, reason, "DOCTOR"):
        return Response({"status": "not_cancellable", "current": a["appointment_type"]}, status=409)
    notify.cancelled(appointment_id, reason, "doctor")
    return Response({"status": "cancelled"})


@api_view(["GET"])
@permission_classes([IsDoctor])
def my_slots(request):
    return Response({"days": slots.available(request.user.permanent_id, include_booked=True)})
