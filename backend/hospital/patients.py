"""Patient validation desk, shared by the hospital admin and receptionists (legacy hospital-portal
temporary-patients-list.html / patient-details.html and reception approved-patients pages).

* validate a self-registered patient            -> legacy approvePatientForCaseSheet (patient.approved_by)
* request a change to a patient's details        -> legacy requestPatientChange (patient_notifications
                                                    CHANGE_REQUEST; the patient approves / rejects in
                                                    the patient portal, Phase 3C)
* temporary registrations (patient_temp)         -> legacy validate(PATIENT) / updateInvalidPatientInfo (HOLD,
                                                    max 3) / rejectInvalidPatient
The legacy pages also called removePermanentDetails, generatePermanentId and checkAllValidations,
which do not exist in the Java backend; nothing to port for them."""
import json
import os
from pathlib import Path

from django.conf import settings
from django.db import transaction
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsDesk
from accounts.db import one, rows, run
from accounts.entities import GEO, Form, detail, file_field, listing, new_id
from accounts.setpw import set_password_link
from patient.files import file_response

# field -> label (legacy change-request wizard fields)
CHANGEABLE = {
    "fname": "First name", "mname": "Middle name", "lname": "Last name", "dob": "Date of birth", "gender": "Gender",
    "marital": "Marital status", "address": "Address", "city": "City", "state": "State", "zipcode": "Zip code",
    "mobno": "Mobile number", "hphone": "Home phone", "emergencycontact": "Emergency contact", "email": "Email",
    "bloodgroup": "Blood group", "insurance_provider": "Insurance provider", "govtidtype": "Govt ID type", "govtidno": "Govt ID number",
}
LIST_COLS = "permanentid, fname, mname, lname, gender, dob, age, mobno, email, city, state, approved_by, date_time"


def approver(request):
    """(id, role, display name) of the logged-in desk user."""
    pid, role = request.user.permanent_id, request.user.role
    if role == "HOSPITAL":
        r = one("SELECT hospital_name n FROM hospital WHERE permanentid=%s", [pid])
    else:
        r = one("SELECT fullname n FROM receptionist WHERE permanentid=%s", [pid])
    return pid, role, (r or {}).get("n") or pid


def pending_path(pid):
    return Path(settings.PENDING_UPLOAD_DIR) / f"{pid.lower()}_govtid.bin"


def _approver_name(aid):
    if not aid:
        return None
    for t, c in (("hospital", "hospital_name"), ("receptionist", "fullname"), ("lab", "labname"), ("pharmacy", "pharmacy_name"),
                 ("internal_admin", "fullname")):
        r = one(f"SELECT {c} n FROM {t} WHERE permanentid=%s", [aid])
        if r:
            return r["n"]
    return aid


@api_view(["GET"])
@permission_classes([IsDesk])
def patients(request):
    q = str(request.GET.get("q", "")).strip()
    flt = request.GET.get("filter", "unvalidated")
    where, args = ["1=1"], []
    if flt == "unvalidated":
        where.append("(approved_by IS NULL OR approved_by='')")
    elif flt == "validated":
        where.append("approved_by IS NOT NULL AND approved_by<>''")
    if q:
        where.append("(permanentid LIKE %s OR CONCAT_WS(' ', fname, lname) LIKE %s OR mobno LIKE %s OR email LIKE %s)")
        args += [f"{q}%", f"%{q}%", f"{q}%", f"{q}%"]
    items = rows(f"SELECT {LIST_COLS} FROM patient WHERE {' AND '.join(where)} ORDER BY date_time DESC LIMIT 200", args)
    return Response({"items": items})


@api_view(["GET"])
@permission_classes([IsDesk])
def patient_detail(request, pid):
    p = detail("patient", pid.upper())
    if not p:
        return Response({"status": "not_found"}, status=404)
    p["validated"] = bool((p.get("approved_by") or "").strip())
    p["approved_by_name"] = _approver_name(p.get("approved_by"))
    pend = one("SELECT id, message, details, changed_by_name, changed_role, created_at FROM patient_notifications "
               "WHERE patient_id=%s AND type='CHANGE_REQUEST' AND status='PENDING' ORDER BY id DESC LIMIT 1", [p["permanentid"]])
    if pend:
        try:
            pend["details"] = json.loads(pend["details"] or "[]")
        except ValueError:
            pend["details"] = []
    history = rows("SELECT id, status, details, changed_by_name, changed_role, created_at, decided_at FROM patient_notifications "
                   "WHERE patient_id=%s AND type='CHANGE_REQUEST' ORDER BY id DESC LIMIT 10", [p["permanentid"]])
    for h in history:
        try:
            h["details"] = json.loads(h["details"] or "[]")
        except ValueError:
            h["details"] = []
    return Response({"patient": p, "pending_request": pend, "requests": history,
                     "children": rows("SELECT child_id, childfname, lname, dob, gender FROM child_reg WHERE parent_id=%s", [p["permanentid"]])})


@api_view(["GET"])
@permission_classes([IsDesk])
def patient_govtid(request, pid):
    r = one("SELECT govtidfile f FROM patient WHERE permanentid=%s", [pid.upper()])
    return file_response((r or {}).get("f"), f"{pid}_govtid")


@api_view(["POST"])
@permission_classes([IsDesk])
def validate(request, pid):
    """Legacy approvePatientForCaseSheet."""
    pid = pid.upper()
    aid, role, name = approver(request)
    with transaction.atomic():
        p = one("SELECT permanentid, approved_by, fname, email FROM patient WHERE permanentid=%s FOR UPDATE", [pid])
        if not p:
            return Response({"status": "not_found", "message": f"Patient not found with Permanent ID: {pid}"}, status=404)
        if (p["approved_by"] or "").strip():
            return Response({"status": "already_validated", "message": f"This patient has already been validated/approved by: {p['approved_by']}"}, status=409)
        run("UPDATE patient SET approved_by=%s WHERE permanentid=%s", [aid, pid])
    mailer.send(p.get("email"), "Case sheet access approved - Cobalt EHR", f"Dear {p.get('fname') or 'Patient'},", [
        "Your account has been successfully validated.",
        "You can now access your <b>Case Sheet</b> and other healthcare services.", f"Validated by: {mailer.e(name)}"])
    return Response({"status": "validated", "message": "Patient approved successfully for case sheet access", "approved_by": aid})


def _clean_change(field, value, f):
    """Validate one proposed value with the same rules as registration."""
    if field in ("fname", "lname"):
        return f.text(field, CHANGEABLE[field], max_len=45, pattern=r"[A-Za-z ]+", msg="Only letters are allowed")
    if field == "mname":
        return f.text(field, CHANGEABLE[field], required=False, max_len=45, pattern=r"[A-Za-z ]+", msg="Only letters are allowed")
    if field == "dob":
        d = f.dob()
        return d.isoformat() if d else None
    if field == "gender":
        return f.choice(field, "Gender", ["Male", "Female", "Transgender", "Other", "Others"])
    if field == "marital":
        return f.choice(field, "Marital status", ["single", "married", "widowed", "divorced"])
    if field == "address":
        return f.text(field, "Address", max_len=60)
    if field == "state":
        return f.choice(field, "State", list(GEO))
    if field == "city":
        return f.text(field, "City", max_len=40)
    if field == "zipcode":
        return f.text(field, "Zip code", pattern=r"[1-9]\d{5}", msg="Zip code must be 6 digits")
    if field in ("mobno", "emergencycontact"):
        return f.mobile(field, CHANGEABLE[field], required=field == "mobno")
    if field == "hphone":
        return f.text(field, "Home phone", required=False, pattern=r"\d{6,11}", msg="Home phone must be 6-11 digits")
    if field == "email":
        return f.email(field, "Email", required=False)
    if field == "bloodgroup":
        return f.choice(field, "Blood group", ["A +ve", "A -ve", "B +ve", "B -ve", "O +ve", "O -ve", "AB +ve", "AB -ve"], required=False)
    if field == "insurance_provider":
        return f.text(field, "Insurance provider", required=False, max_len=40)
    if field == "govtidtype":
        return f.choice(field, "Govt ID type", ["Aadhaar Card"])
    if field == "govtidno":
        return f.text(field, "Govt ID number", pattern=r"[2-9]\d{11}", msg="Aadhaar number must be 12 digits")
    return value


@api_view(["POST"])
@permission_classes([IsDesk])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def change_request(request, pid):
    """Legacy requestPatientChange. Body: changes = {field: new value} (JSON or JSON string) and an
    optional new ID proof file 'govtidfile'. Nothing changes until the patient approves."""
    pid = pid.upper()
    p = one("SELECT * FROM patient WHERE permanentid=%s", [pid])
    if not p:
        return Response({"status": "not_found"}, status=404)
    raw = request.data.get("changes") or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = {}
    raw = {k: ("" if v is None else str(v).strip()) for k, v in (raw.items() if isinstance(raw, dict) else []) if k in CHANGEABLE}
    f = Form(raw)
    details, payload = [], {}
    for field, value in raw.items():
        new = _clean_change(field, value, f)
        old = p.get(field)
        old_s = "" if old is None else str(old)
        new_s = "" if new is None else str(new)
        if field not in f.errors and new_s != old_s:
            details.append({"field": field, "label": CHANGEABLE[field], "old": old_s, "new": new_s})
            payload[field] = new_s
    if "dob" in payload:
        payload["age"] = str(f.clean.get("age"))
    data, err = file_field(request, "govtidfile", "New ID proof", required=False)
    if err:
        f.errors["govtidfile"] = err
    if f.errors:
        return f.response()
    if data:
        details.append({"field": "govtidfile", "label": "Govt ID proof", "old": "Current file", "new": "New file uploaded"})
    if not details:
        return Response({"status": "no_changes", "message": "Nothing was changed."}, status=400)
    aid, role, name = approver(request)
    labels = list(dict.fromkeys(d["label"] for d in details))
    who = "Hospital" if role == "HOSPITAL" else "Hospital reception"
    message = (f"{who} staff requested to update your details: {', '.join(labels)}. "
               "Please review and Approve or Reject. Nothing changes until you approve.")[:500]
    with transaction.atomic():
        run("UPDATE patient_notifications SET status='EXPIRED', decided_at=NOW() WHERE patient_id=%s AND status='PENDING'", [pid])
        run("INSERT INTO patient_notifications (patient_id, title, message, details, proposed_payload, type, status, changed_by, changed_by_name, changed_role) "
            "VALUES (%s,%s,%s,%s,%s,'CHANGE_REQUEST','PENDING',%s,%s,%s)",
            [pid, "Approval needed: update to your details", message, json.dumps(details), json.dumps(payload), aid, name, role])
        path = pending_path(pid)
        if data:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        elif path.exists():
            path.unlink()            # an older pending file belonged to the request that just expired
    mailer.send(p.get("email"), "Approval needed: update to your details", "Approval needed",
                [message, "Open Notifications in the patient portal to approve or reject."])
    return Response({"status": "requested", "message": "Change request sent to patient for approval", "details": details}, status=201)


# ------------------------------------------------------------------ temporary registrations (patient_temp)
@api_view(["GET"])
@permission_classes([IsDesk])
def temp_patients(request):
    items = listing("patient_temp", "COALESCE(status,'') <> 'REJECTED'", order="date_time DESC")
    for i in items:
        h = one("SELECT status, reason_for_hold, hold_attempt, approved_by FROM temp_user_hold_info WHERE temp_id=%s", [i["temp_id"]])
        i["hold"] = h
    return Response({"items": items})


@api_view(["GET"])
@permission_classes([IsDesk])
def temp_patient_file(request, temp_id):
    r = one("SELECT govtidfile f FROM patient_temp WHERE temp_id=%s", [temp_id])
    return file_response((r or {}).get("f"), f"{temp_id}_govtid")


def _temp(temp_id):
    return one("SELECT * FROM patient_temp WHERE temp_id=%s", [temp_id])


@api_view(["POST"])
@permission_classes([IsDesk])
def temp_hold(request, temp_id):
    """Legacy updateInvalidPatientInfo: status HOLD + reason, at most 3 holds."""
    t = _temp(temp_id)
    if not t:
        return Response({"status": "not_found"}, status=404)
    reason = str(request.data.get("reason", "")).strip()
    if not reason or len(reason) > 100:
        return Response({"status": "reason_required", "max": 100}, status=400)
    aid, _, name = approver(request)
    holds = int(t.get("hold_attempt") or 0)
    if holds >= 3:
        return Response({"status": "max_holds", "message": "This registration was already put on hold 3 times. Reject or validate it."}, status=409)
    holds += 1
    with transaction.atomic():
        run("UPDATE patient_temp SET status='HOLD', approved_by=%s, hold_attempt=%s WHERE temp_id=%s", [aid, holds, temp_id])
        if one("SELECT temp_id FROM temp_user_hold_info WHERE temp_id=%s", [temp_id]):
            run("UPDATE temp_user_hold_info SET status='HOLD', reason_for_hold=%s, hold_attempt=%s, approved_by=%s WHERE temp_id=%s",
                [reason, holds, aid, temp_id])
        else:
            run("INSERT INTO temp_user_hold_info (temp_id, pat_name, email, status, reason_for_hold, hold_attempt, approved_by) VALUES (%s,%s,%s,'HOLD',%s,%s,%s)",
                [temp_id, f"{t['fname']} {t['lname'] or ''}".strip()[:100], t["email"], reason, holds, aid])
    mailer.send(t.get("email"), "Your registration is on hold", f"Dear {t.get('fname')},", [
        "Your registration could not be validated yet.", f"Reason: <b>{mailer.e(reason)}</b>",
        f"Please correct the details and contact {mailer.e(name)}."])
    return Response({"status": "on_hold", "hold_attempt": holds})


@api_view(["POST"])
@permission_classes([IsDesk])
def temp_reject(request, temp_id):
    """Legacy rejectInvalidPatient: only after earlier holds; the temporary record is deleted."""
    t = _temp(temp_id)
    if not t:
        return Response({"status": "not_found"}, status=404)
    reason = str(request.data.get("reason", "")).strip()
    if not reason or len(reason) > 100:
        return Response({"status": "reason_required", "max": 100}, status=400)
    if int(t.get("hold_attempt") or 0) < 2:
        return Response({"status": "hold_first", "message": "A registration can be rejected only after it was put on hold at least twice."}, status=409)
    aid, _, name = approver(request)
    with transaction.atomic():
        run("DELETE FROM temp_user_hold_info WHERE temp_id=%s", [temp_id])
        run("DELETE FROM patient_temp WHERE temp_id=%s", [temp_id])
    mailer.send(t.get("email"), "Your registration was rejected", f"Dear {t.get('fname')},", [
        "Your registration was rejected.", f"Reason: <b>{mailer.e(reason)}</b>", f"Rejected by: {mailer.e(name)}"])
    return Response({"status": "rejected"})


@api_view(["POST"])
@permission_classes([IsDesk])
def temp_validate(request, temp_id):
    """Legacy validate(PATIENT): copy patient_temp into patient with a new PAT id, add the login row,
    remove the temporary rows. The account is then activated with "Set password"."""
    t = _temp(temp_id)
    if not t:
        return Response({"status": "not_found"}, status=404)
    aid, _, name = approver(request)
    cols = ["fname", "lname", "mname", "dob", "age", "gender", "marital", "address", "city", "state", "country", "zipcode", "mobno", "hphone",
            "emergencycontact", "email", "bloodgroup", "insurance_provider", "govtidtype", "govtidno", "govtidfile", "family_history",
            "past_history", "drug_history", "social_history"]
    with transaction.atomic():
        pid = new_id("PAT", "patient")
        run(f"INSERT INTO patient (temp_id, permanentid, pswrd, {', '.join(cols)}, approved_by, date_time) "
            f"VALUES (%s,%s,'',{','.join(['%s'] * len(cols))},%s,NOW())", [temp_id, pid, *[t.get(c) for c in cols], aid])
        run("INSERT INTO login (permanentid, pswrd, isdefault_password, systemLoginTime, pswrd_changed_time, failed_attempt, account_locked, lock_time) "
            "VALUES (%s,'','YES',NOW(),NOW(),0,'NO',0)", [pid])
        run("DELETE FROM temp_user_hold_info WHERE temp_id=%s", [temp_id])
        run("DELETE FROM patient_temp WHERE temp_id=%s", [temp_id])
    link = set_password_link(pid)
    mailer.send(t.get("email"), f"Registration approved - Permanent ID {pid}", f"Dear {t.get('fname')},", [
        "Congratulations! Your registration with Cobalt EHR was validated.", f"Your Permanent ID: <b>{pid}</b>",
        f"<a href='{link}'>Set your password</a> to log in.", f"Validated by: {mailer.e(name)}"])
    return Response({"status": "validated", "permanentid": pid})
