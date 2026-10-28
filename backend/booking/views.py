from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.authn import IsAnyClinical, IsPatient, IsPatientOrReceptionist
from accounts.db import one, rows

from . import notify, service, slots

ERR = {"slot_unavailable": 409, "patient_conflict": 409, "busy": 503, "not_found": 404, "invalid_type": 400,
       "not_reschedulable": 409, "same_slot": 400}


def reception_hospital(request):
    """Hospital of the logged-in receptionist / hospital admin, or None for patients."""
    if request.user.role == "HOSPITAL":
        return request.user.permanent_id
    if request.user.role != "RECEPTIONIST":
        return None
    r = one("SELECT hospital_id FROM receptionist WHERE permanentid=%s", [request.user.permanent_id])
    return (r or {}).get("hospital_id") or ""


@api_view(["GET"])
@permission_classes([IsAnyClinical])
def symptoms(request):
    cols = rows("SELECT * FROM face_sheet_symptoms")
    out = {}
    for r in cols:
        for part, val in r.items():
            if val and str(val).strip():
                out.setdefault(part, []).append(str(val).strip())
    return Response({"symptoms": {k: sorted(set(v)) for k, v in out.items()}})


@api_view(["GET"])
@permission_classes([IsPatientOrReceptionist])
def doctors(request):
    forced = reception_hospital(request)
    items = rows("SELECT DISTINCT d.permanentid, d.fname, d.mname, d.lname, d.specialization, d.qualification, d.experience, "
                 "d.deptname, d.hospital_id, h.hospital_name, h.city FROM doctor d JOIN hospital h ON h.permanentid=d.hospital_id "
                 "JOIN default_dr_slot s ON s.doctorid=d.permanentid ORDER BY h.city, h.hospital_name, d.deptname, d.fname")
    if forced is not None:
        items = [i for i in items if i["hospital_id"] == forced]
    facets = {
        "cities": sorted({i["city"] for i in items if i["city"]}),
        "hospitals": sorted({(i["hospital_id"], i["hospital_name"], i["city"]) for i in items}, key=lambda x: x[1] or ""),
        "departments": sorted({(i["hospital_id"], i["deptname"]) for i in items if i["deptname"]}),
    }
    facets["hospitals"] = [{"id": a, "name": b, "city": c} for a, b, c in facets["hospitals"]]
    facets["departments"] = [{"hospital_id": a, "name": b} for a, b in facets["departments"]]
    for i in items:
        i["name"] = " ".join(x for x in (i["fname"], i["mname"], i["lname"]) if x)
    return Response({"doctors": items, "facets": facets})


@api_view(["GET"])
@permission_classes([IsPatientOrReceptionist])
def doctor_slots(request, doctor_id):
    doc = service.doctor_row(doctor_id)
    forced = reception_hospital(request)
    if not doc or (forced is not None and doc["hospital_id"] != forced):
        return Response({"status": "not_found"}, status=404)
    return Response({"doctor": {"id": doctor_id, "name": f'{doc["fname"]} {doc["lname"] or ""}'.strip(), "deptname": doc["deptname"],
                                "hospital_name": doc["hospital_name"]}, "days": slots.available(doctor_id)})


@api_view(["POST"])
@permission_classes([IsPatientOrReceptionist])
def book(request):
    d = request.data
    doctor_id, date_s, time_s = (str(d.get(k, "")).strip() for k in ("doctor_id", "date", "time"))
    if not (doctor_id and date_s and time_s):
        return Response({"status": "missing_fields"}, status=400)
    if request.user.role == "PATIENT":
        patient_id = request.user.permanent_id
    else:
        patient_id = str(d.get("patient_id", "")).strip().upper()
        doc = service.doctor_row(doctor_id)
        if not patient_id:
            return Response({"status": "missing_fields"}, status=400)
        if not doc or doc["hospital_id"] != reception_hospital(request):
            return Response({"status": "not_found"}, status=404)
    ok, code, apid = service.create(patient_id, doctor_id, date_s, time_s, d.get("symptoms", ""), str(d.get("type", "consult")))
    if not ok:
        return Response({"status": code}, status=ERR.get(code, 400))
    notify.booked(apid)
    return Response({"status": "booked", "appointment_id": apid}, status=201)


@api_view(["POST"])
@permission_classes([IsPatientOrReceptionist])
def reschedule(request, appointment_id):
    date_s, time_s = str(request.data.get("date", "")).strip(), str(request.data.get("time", "")).strip()
    if not (date_s and time_s):
        return Response({"status": "missing_fields"}, status=400)
    appt = one("SELECT * FROM appointment WHERE appointmentid=%s", [appointment_id])
    if request.user.role == "PATIENT":
        allowed = appt and appt["permanentid"] == request.user.permanent_id
        by = "PATIENT"
    else:
        allowed = appt and appt["hospital_id"] == reception_hospital(request)
        by = "RECEPTION"
    if not allowed:
        return Response({"status": "not_found"}, status=404)
    ok, code = service.reschedule(appt, date_s, time_s, by)
    if ok:
        notify.rescheduled(appointment_id)
    return Response({"status": code}, status=200 if ok else ERR.get(code, 400))
