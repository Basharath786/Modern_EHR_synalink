"""Patient access level (Java menu-restrictions.js)."""
from rest_framework.response import Response

from accounts.db import one


def is_validated(pid):
    """Java menu-restrictions.js: a patient gets the full portal once a hospital / lab / pharmacy /
    receptionist validated the Permanent ID (patient.approved_by is filled)."""
    r = one("SELECT approved_by FROM patient WHERE permanentid=%s", [pid]) or {}
    return bool((r.get("approved_by") or "").strip())


def require_validated(view):
    def wrapped(request, *a, **kw):
        if not is_validated(request.user.permanent_id):
            return Response({"status": "not_validated",
                             "message": "Your patient account is not validated yet. Please visit a Hospital, Laboratory, Pharmacy or Receptionist."},
                            status=403)
        return view(request, *a, **kw)
    wrapped.__name__ = view.__name__
    return wrapped
