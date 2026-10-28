"""Shared helpers for the registration / approval screens of Phase 4 (hospital portal, internal
admin, super admin): table specs, safe row output (no passwords, no BLOBs), ID generation,
India state/city data and field validation copied from the legacy registration pages."""
import json
import random
import re
import string
from datetime import date, datetime
from pathlib import Path

from rest_framework.response import Response

from .db import one, rows

DATA = Path(__file__).resolve().parent / "data"
GEO = json.loads((DATA / "india_geo.json").read_text())          # legacy assets/js/countries.js (India only)
SPECIALITIES = json.loads((DATA / "specialities.json").read_text())  # legacy hosp-reg.js / doctor-register.html

# name -> (table, id column, display-name SQL, blob columns)
ENTITY = {
    "hospital": ("hospital", "permanentid", "hospital_name", ("pan_card", "gst_proof", "registration_proof")),
    "lab": ("lab", "permanentid", "labname", ("panimage", "civilimage")),
    "pharmacy": ("pharmacy", "permanentid", "pharmacy_name", ("panimage", "civilimage")),
    "doctor": ("doctor", "permanentid", "CONCAT_WS(' ', fname, lname)", ("mcifile", "govtidfile")),
    "nurse": ("nurse", "permanentid", "CONCAT_WS(' ', fname, lname)", ("mcifile", "govtidfile")),
    "receptionist": ("receptionist", "permanentid", "fullname", ("govtidfile",)),
    "department": ("department", "permanentid", "deptname", ()),
    "admin": ("internal_admin", "permanentid", "fullname", ("govtidfile",)),
    "admin_temp": ("internal_admin_temp", "temp_id", "fullname", ("govtidfile",)),
    "patient": ("patient", "permanentid", "CONCAT_WS(' ', fname, lname)", ("govtidfile",)),
    "patient_temp": ("patient_temp", "temp_id", "CONCAT_WS(' ', fname, lname)", ("govtidfile",)),
    "child": ("child_reg", "child_id", "CONCAT_WS(' ', childfname, lname)", ("govtidfile",)),
    "lab_staff": ("lab_staff", "permanentid", "fname", ("govtidfile",)),
    "pharmacy_staff": ("pharmacy_staff", "permanentid", "fname", ("govtidfile",)),
}
HIDDEN = {"pswrd", "otp", "otp_generated_at", "otp_verified", "otp_attempts", "verification_code", "verification_code_settime"}

_COLS = {}


def columns(table):
    if table not in _COLS:
        _COLS[table] = [r["COLUMN_NAME"] for r in rows(
            "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=%s ORDER BY ORDINAL_POSITION", [table])]
    return _COLS[table]


def select_list(kind, alias=""):
    """Every column except passwords/OTP; BLOB columns become has_<col> flags."""
    table, _, _, blobs = ENTITY[kind]
    p = f"{alias}." if alias else ""
    out = []
    for c in columns(table):
        if c in HIDDEN:
            continue
        if c in blobs:
            out.append(f"({p}{c} IS NOT NULL AND LENGTH({p}{c})>0) AS has_{c}")
        else:
            out.append(f"{p}{c}")
    return ", ".join(out)


def detail(kind, ident, extra_where="", params=()):
    table, idcol, _, _ = ENTITY[kind]
    return one(f"SELECT {select_list(kind)} FROM {table} WHERE {idcol}=%s {extra_where}", [ident, *params])


def listing(kind, where="1=1", params=(), order=None):
    table, idcol, name, _ = ENTITY[kind]
    return rows(f"SELECT {select_list(kind)}, {name} AS display_name FROM {table} WHERE {where} ORDER BY {order or 'date_time DESC'}", list(params))


def blob(kind, ident, col):
    table, idcol, _, blobs = ENTITY[kind]
    if col not in blobs:
        return None
    r = one(f"SELECT {col} AS f FROM {table} WHERE {idcol}=%s", [ident])
    return (r or {}).get("f")


def new_id(prefix, table, col="permanentid", digits=5):
    """Legacy: prefix + 5 random digits (DOC/REC/HOS: 10000-99999). Retries on collision."""
    for _ in range(50):
        pid = prefix + (str(random.randint(10 ** (digits - 1), 10 ** digits - 1)))
        if not one(f"SELECT 1 x FROM {table} WHERE {col}=%s", [pid]):
            return pid
    raise RuntimeError("could not allocate id")


def temp_id(table):
    """Legacy temp_id: 10 random letters/digits."""
    alphabet = string.ascii_letters + string.digits
    for _ in range(50):
        t = "".join(random.choice(alphabet) for _ in range(10))
        if not one(f"SELECT 1 x FROM {table} WHERE temp_id=%s", [t]):
            return t
    raise RuntimeError("could not allocate temp id")


def random_password(n=8):
    """Legacy PermanentId.insertIdNo(8): 2 letters + 8 mixed chars (stored encrypted, never shown)."""
    letters = string.ascii_letters
    values = letters + string.digits + "!@$%^&*_=+-/)"
    return "".join(random.choice(letters) for _ in range(2)) + "".join(random.choice(values) for _ in range(n))


def age_from(dob: date) -> int:
    t = date.today()
    return t.year - dob.year - ((t.month, t.day) < (dob.month, dob.day))


# ------------------------------------------------------------------ validation
class Form:
    """Tiny validator; collects {field: message} like the legacy *_error spans."""

    def __init__(self, data):
        self.d, self.errors, self.clean = data, {}, {}

    def get(self, k):
        v = self.d.get(k)
        return "" if v is None else str(v).strip()

    def text(self, k, label, required=True, max_len=None, pattern=None, msg=None):
        v = self.get(k)
        if not v:
            if required:
                self.errors[k] = f"Please enter {label.lower()}"
            self.clean[k] = v
            return v
        if max_len and len(v) > max_len:
            self.errors[k] = f"{label} must be at most {max_len} characters"
        elif pattern and not re.fullmatch(pattern, v):
            self.errors[k] = msg or f"Please enter a valid {label.lower()}"
        self.clean[k] = v
        return v

    def choice(self, k, label, options, required=True):
        v = self.get(k)
        if not v:
            if required:
                self.errors[k] = f"Please select {label.lower()}"
        elif v not in options:
            self.errors[k] = f"Please select a valid {label.lower()}"
        self.clean[k] = v
        return v

    def number(self, k, label, required=True, digits=None, max_value=None, default=None):
        v = self.get(k)
        if not v:
            if required:
                self.errors[k] = f"Please enter {label.lower()}"
            self.clean[k] = default
            return default
        if not v.isdigit() or (digits and len(v) != digits):
            self.errors[k] = f"{label} must be {digits} digits" if digits else f"{label} must be a number"
        elif max_value is not None and int(v) > max_value:
            self.errors[k] = f"{label} is too large"
        self.clean[k] = int(v) if v.isdigit() else v
        return self.clean[k]

    def mobile(self, k, label="Mobile number", required=True):
        v = self.get(k)
        if not v:
            if required:
                self.errors[k] = f"Please enter {label.lower()}"
            self.clean[k] = None
            return None
        if not re.fullmatch(r"[6-9]\d{9}", v):
            self.errors[k] = f"{label} must be 10 digits starting with 6-9"
        self.clean[k] = v
        return v

    def email(self, k, label="Email", required=True, max_len=40):
        v = self.get(k).lower()
        if not v:
            if required:
                self.errors[k] = f"Please enter {label.lower()}"
        elif len(v) > max_len or ".." in v or not re.fullmatch(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}", v):
            self.errors[k] = "Please enter a valid email address"
        self.clean[k] = v
        return v

    def dob(self, k="dob", min_age=0):
        v = self.get(k)
        try:
            d = datetime.strptime(v, "%Y-%m-%d").date()
        except ValueError:
            self.errors[k] = "Please enter a valid date of birth"
            self.clean[k] = None
            return None
        if d >= date.today() or d.year < 1900:
            self.errors[k] = "Please enter a valid date of birth"
        elif age_from(d) < min_age:
            self.errors[k] = f"Age must be at least {min_age} years"
        self.clean[k] = d
        self.clean["age"] = age_from(d)
        return d

    def address_block(self):
        """Country (India) / state / city / zipcode, as in the legacy countries.js dropdowns."""
        self.choice("country", "Country", ["India"])
        st = self.choice("state", "State", list(GEO))
        city = self.get("city")
        if not city:
            self.errors["city"] = "Please select city / district"
        elif st in GEO and city not in GEO[st]:
            self.errors["city"] = "Please select a valid city / district"
        self.clean["city"] = city
        self.text("zipcode", "Zip code", pattern=r"[1-9]\d{5}", msg="Zip code must be 6 digits")

    def govt_id(self):
        self.choice("govtidtype", "Govt ID type", ["Aadhaar Card"])
        self.text("govtidno", "Govt ID number", pattern=r"[2-9]\d{11}", msg="Aadhaar number must be 12 digits and cannot start with 0 or 1")

    def response(self):
        return Response({"status": "invalid", "errors": self.errors}, status=400)


def file_field(request, key, label, required=True, max_bytes=5 * 1024 * 1024):
    """Returns (bytes|None, error message|None). PDF / JPG / PNG like the legacy uploads."""
    from patient.files import sniff
    f = request.FILES.get(key)
    if not f:
        return None, (f"Please upload {label}" if required else None)
    if f.size > max_bytes:
        return None, f"{label} must be smaller than {max_bytes // (1024 * 1024)} MB"
    data = f.read()
    if sniff(data)[1] not in ("pdf", "jpg", "png"):
        return None, f"{label} must be a PDF, JPG or PNG file"
    return data, None
