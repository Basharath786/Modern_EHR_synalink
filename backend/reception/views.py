"""Reception portal APIs (Phase 3A). Everything is scoped to the receptionist's own hospital."""
from datetime import date

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.authn import IsDesk
from accounts.db import one, rows
from booking import notify, service
from booking.views import reception_hospital
from doctor.views import COLS, OPEN, _sort

CANCEL_BY = "RECEPTION"


def _hospital(request):
    return reception_hospital(request)


@api_view(["GET"])
@permission_classes([IsDesk])
def dashboard(request):
    h, today = _hospital(request), date.today().isoformat()
    todays = _sort(rows(f"SELECT {COLS} FROM appointment WHERE hospital_id=%s AND date_of_booking=%s", [h, today]))
    return Response({
        "today": {"total": len([a for a in todays if a["appointment_type"] != "cancelled"]),
                  "waiting": len([a for a in todays if a["appointment_type"] in OPEN]),
                  "completed": len([a for a in todays if a["appointment_type"] == "completed"]),
                  "cancelled": len([a for a in todays if a["appointment_type"] == "cancelled"])},
        "upcoming": one("SELECT COUNT(*) n FROM appointment WHERE hospital_id=%s AND date_of_booking>%s AND appointment_type IN %s", [h, today, OPEN])["n"],
        "doctors": one("SELECT COUNT(*) n FROM doctor WHERE hospital_id=%s", [h])["n"],
        "hospital": (one("SELECT hospital_name FROM hospital WHERE permanentid=%s", [h]) or {}).get("hospital_name"),
        "queue": todays[:10],
    })


@api_view(["GET"])
@permission_classes([IsDesk])
def appointments(request):
    h, today, scope = _hospital(request), date.today().isoformat(), request.GET.get("scope", "today")
    q = f"SELECT {COLS} FROM appointment WHERE hospital_id=%s"
    if scope == "today":
        items = _sort(rows(q + " AND date_of_booking=%s", [h, today]))
    elif scope == "upcoming":
        items = _sort(rows(q + " AND date_of_booking>%s AND appointment_type IN %s", [h, today, OPEN]))
    elif scope == "past":
        items = _sort(rows(q + " AND date_of_booking<%s", [h, today]), reverse=True)
    else:
        items = rows(q + " ORDER BY date_time DESC", [h])
    term = request.GET.get("q", "").strip().lower()
    if term:
        items = [a for a in items if term in " ".join(str(a[k] or "") for k in ("appointmentid", "permanentid", "fullname", "doctorid")).lower()
                 or term in (a.get("doctor_name") or "").lower()]
    return Response({"appointments": items})


@api_view(["GET"])
@permission_classes([IsDesk])
def patient_search(request):
    q = request.GET.get("q", "").strip()
    if len(q) < 2:
        return Response({"patients": []})
    like = f"%{q}%"
    return Response({"patients": rows(
        "SELECT permanentid, fname, mname, lname, age, gender, mobno, email FROM patient "
        "WHERE permanentid LIKE %s OR fname LIKE %s OR lname LIKE %s OR CAST(mobno AS CHAR) LIKE %s ORDER BY fname LIMIT 20",
        [q + "%", like, like, q + "%"])})


@api_view(["POST"])
@permission_classes([IsDesk])
def cancel(request, appointment_id):
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 30:
        return Response({"status": "reason_too_long", "max": 30}, status=400)
    a = one(f"SELECT {COLS} FROM appointment WHERE appointmentid=%s AND hospital_id=%s", [appointment_id, _hospital(request)])
    if not a:
        return Response({"status": "not_found"}, status=404)
    by = "HOSPITAL" if request.user.role == "HOSPITAL" else CANCEL_BY
    if not service.cancel(a, reason, by):
        return Response({"status": "not_cancellable", "current": a["appointment_type"]}, status=409)
    notify.cancelled(appointment_id, reason, "hospital" if by == "HOSPITAL" else "reception")
    return Response({"status": "cancelled"})
