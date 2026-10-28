"""Hospital <-> laboratory / pharmacy affiliations (legacy affiliation_request table and the
hospital.affiliated_labs_list / affiliated_pharmacy_list + lab/pharmacy.affiliated_hospital_list
comma lists).

Legacy endpoints: hospitalRequestAffiliationWithLab / WithPharmacy, listOfPendingRequestsFromHospitalTo*,
pendingLabsWithHospital / pendingPharmacyWithHospital, labConfirmsAffiliation / pharmacyConfirmsAffiliation
(called by the hospital for requests the lab/pharmacy sent), HospitalCancelLabAffiliation /
hospitalCancelPharmaAffiliation, listOfLabsRejectedByHospital / listOfPharmacyRejectedByHospital,
labsAffiliatedWithHospital / pharmaciesAffiliatedWithHospital, listApproved*Summery (Request Lab page).

Status values (same as legacy): request_to = 'lab' | 'pharmacy' (hospital asked) or 'hospital'
(lab / pharmacy asked); status = 'request-sent' | 'request-cancelled'. A confirmed request is
deleted and both comma lists get the other side's ID."""
from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts import mailer
from accounts.authn import IsHospital
from accounts.db import one, rows, run

KIND = {
    #          table     id col in affiliation_request  name col          email col          hospital list col           partner list col
    "lab": ("lab", "labid", "labname", "labemail", "affiliated_labs_list", "affiliated_hospital_list"),
    "pharmacy": ("pharmacy", "pharmacy_id", "pharmacy_name", "pharmacy_email", "affiliated_pharmacy_list", "affiliated_hospital_list"),
}


def split_ids(v):
    return [x.strip() for x in (v or "").split(",") if x.strip() and x.strip().lower() != "null"]


def _info(kind, ids):
    table, _, name, email, _, _ = KIND[kind]
    if not ids:
        return {}
    ph = ",".join(["%s"] * len(ids))
    return {r["permanentid"]: r for r in rows(
        f"SELECT permanentid, {name} AS name, address, city, state, {email} AS email, land_phone, administration_no, contact_person_name, "
        f"approved_by FROM {table} WHERE permanentid IN ({ph})", ids)}


def state(hid, kind):
    table, col, name, email, hlist, plist = KIND[kind]
    h = one(f"SELECT {hlist} AS l FROM hospital WHERE permanentid=%s", [hid]) or {}
    affiliated = split_ids(h.get("l"))
    req = rows(f"SELECT {col} AS pid, request_to, status, cancel_reason, date FROM affiliation_request "
               f"WHERE hospital_id=%s AND {col} IS NOT NULL AND {col} NOT IN ('','null') ORDER BY date DESC", [hid])
    info = _info(kind, list({*affiliated, *[r["pid"] for r in req]}))
    pack = lambda r: {**(info.get(r["pid"]) or {"permanentid": r["pid"], "name": r["pid"]}), "date": r["date"], "cancel_reason": r["cancel_reason"]}
    out = {
        "affiliated": [info.get(i) or {"permanentid": i, "name": i} for i in affiliated],
        "outgoing": [pack(r) for r in req if r["request_to"] == kind and r["status"] == "request-sent"],
        "rejected_by_them": [pack(r) for r in req if r["request_to"] == kind and r["status"] == "request-cancelled"],
        "incoming": [pack(r) for r in req if r["request_to"] == "hospital" and r["status"] == "request-sent"],
        "rejected_by_me": [pack(r) for r in req if r["request_to"] == "hospital" and r["status"] == "request-cancelled"],
    }
    busy = set(affiliated) | {r["pid"] for r in req if r["status"] == "request-sent"}
    # Request Lab / Request Pharmacy page: approved partners not yet affiliated or waiting
    out["available"] = [r for r in rows(f"SELECT permanentid, {name} AS name, address, city, state, {email} AS email, land_phone FROM {table} "
                                        "WHERE permanentid IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>'' ORDER BY name")
                        if r["permanentid"] not in busy]
    return out


def _names(hid, kind, pid):
    table, _, name, email, _, _ = KIND[kind]
    h = one("SELECT hospital_name, hospital_email, city FROM hospital WHERE permanentid=%s", [hid]) or {}
    p = one(f"SELECT {name} AS name, {email} AS email, city FROM {table} WHERE permanentid=%s", [pid]) or {}
    return h, p


@api_view(["GET"])
@permission_classes([IsHospital])
def overview(request, kind):
    if kind not in KIND:
        return Response({"status": "not_found"}, status=404)
    return Response(state(request.user.permanent_id, kind))


@api_view(["POST"])
@permission_classes([IsHospital])
def send_request(request, kind, pid):
    if kind not in KIND:
        return Response({"status": "not_found"}, status=404)
    hid = request.user.permanent_id
    table, col, *_ = KIND[kind]
    if not one(f"SELECT permanentid FROM {table} WHERE permanentid=%s AND approved_by IS NOT NULL AND approved_by<>''", [pid]):
        return Response({"status": "not_found"}, status=404)
    st = state(hid, kind)
    if pid in [x["permanentid"] for x in st["affiliated"]]:
        return Response({"status": "already_affiliated"}, status=409)
    if pid in [x["permanentid"] for x in st["outgoing"] + st["incoming"]]:
        return Response({"status": "already_requested"}, status=409)
    with transaction.atomic():
        # an earlier rejected request is replaced by the new one
        run(f"DELETE FROM affiliation_request WHERE hospital_id=%s AND {col}=%s AND status='request-cancelled'", [hid, pid])
        run(f"INSERT INTO affiliation_request (hospital_id, {col}, request_to, status, date) VALUES (%s,%s,%s,'request-sent',NOW())", [hid, pid, kind])
    h, p = _names(hid, kind, pid)
    mailer.send(h.get("hospital_email"), "Affiliation request sent", "Affiliation request sent",
                [f"You sent an affiliation request to <b>{mailer.e(p.get('name'))}</b> ({pid}), {mailer.e(p.get('city'))}."])
    mailer.send(p.get("email"), "New affiliation request", "New affiliation request",
                [f"<b>{mailer.e(h.get('hospital_name'))}</b> ({hid}), {mailer.e(h.get('city'))} wants to affiliate with you.",
                 "Open your portal to accept or reject the request."])
    return Response({"status": "requested", **state(hid, kind)}, status=201)


def _append(table, list_col, where_id, add_id):
    r = one(f"SELECT {list_col} AS l FROM {table} WHERE permanentid=%s FOR UPDATE", [where_id]) or {}
    ids = split_ids(r.get("l"))
    if add_id not in ids:
        ids.append(add_id)
    run(f"UPDATE {table} SET {list_col}=%s WHERE permanentid=%s", [",".join(ids), where_id])


@api_view(["POST"])
@permission_classes([IsHospital])
def accept(request, kind, pid):
    """Hospital accepts a request the lab / pharmacy sent (legacy *ConfirmsAffiliation with request_to='hospital')."""
    if kind not in KIND:
        return Response({"status": "not_found"}, status=404)
    hid = request.user.permanent_id
    table, col, _, _, hlist, plist = KIND[kind]
    with transaction.atomic():
        r = one(f"SELECT * FROM affiliation_request WHERE hospital_id=%s AND {col}=%s AND request_to='hospital' AND status='request-sent' FOR UPDATE", [hid, pid])
        if not r:
            return Response({"status": "not_found"}, status=404)
        _append(table, plist, pid, hid)
        _append("hospital", hlist, hid, pid)
        run(f"DELETE FROM affiliation_request WHERE hospital_id=%s AND {col}=%s AND request_to='hospital'", [hid, pid])
    h, p = _names(hid, kind, pid)
    mailer.send(p.get("email"), "Affiliation request accepted", "Affiliation accepted",
                [f"<b>{mailer.e(h.get('hospital_name'))}</b> ({hid}) accepted your affiliation request."])
    mailer.send(h.get("hospital_email"), "Affiliation confirmed", "Affiliation confirmed",
                [f"You are now affiliated with <b>{mailer.e(p.get('name'))}</b> ({pid})."])
    return Response({"status": "accepted", **state(hid, kind)})


@api_view(["POST"])
@permission_classes([IsHospital])
def reject(request, kind, pid):
    """Legacy HospitalCancelLabAffiliation / hospitalCancelPharmaAffiliation (status 'request-cancelled' + reason)."""
    if kind not in KIND:
        return Response({"status": "not_found"}, status=404)
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"status": "reason_required"}, status=400)
    if len(reason) > 300:
        return Response({"status": "reason_too_long", "max": 300}, status=400)
    hid = request.user.permanent_id
    _, col, *_ = KIND[kind]
    n = run(f"UPDATE affiliation_request SET status='request-cancelled', date=NOW(), cancel_reason=%s "
            f"WHERE hospital_id=%s AND {col}=%s AND request_to='hospital' AND status='request-sent'", [reason, hid, pid])
    if not n:
        return Response({"status": "not_found"}, status=404)
    h, p = _names(hid, kind, pid)
    mailer.send(p.get("email"), "Affiliation request rejected", "Affiliation request rejected",
                [f"<b>{mailer.e(h.get('hospital_name'))}</b> ({hid}) rejected your affiliation request.", f"Reason: {mailer.e(reason)}"])
    mailer.send(h.get("hospital_email"), "Affiliation request rejected", "Affiliation request rejected",
                [f"You rejected the affiliation request of <b>{mailer.e(p.get('name'))}</b> ({pid}).", f"Reason: {mailer.e(reason)}"])
    return Response({"status": "rejected", **state(hid, kind)})
