"""Role detection and table mapping (mirrors Java Role / UserUtility.getTableName)."""

# Longest / most specific prefixes first (PHST before PHAR, ADMIN before others).
PREFIX_TO_ROLE = [
    ("ADMIN", "ADMIN"),
    ("PHST", "PHARMACY_STAFF"),
    ("PHAR", "PHARMACY"),
    ("LBST", "LAB_STAFF"),
    ("LAB", "LAB"),
    ("HOS", "HOSPITAL"),
    ("DOC", "DOCTOR"),
    ("REC", "RECEPTIONIST"),
    ("NUR", "NURSE"),
    ("PAT", "PATIENT"),
]

# role -> (table, SQL expression for display name)
ROLE_TABLES = {
    "PATIENT": ("patient", "CONCAT_WS(' ', fname, lname)"),
    "DOCTOR": ("doctor", "CONCAT_WS(' ', fname, lname)"),
    "NURSE": ("nurse", "CONCAT_WS(' ', fname, lname)"),
    "HOSPITAL": ("hospital", "hospital_name"),
    "LAB": ("lab", "labname"),
    "LAB_STAFF": ("lab_staff", "fname"),
    "PHARMACY": ("pharmacy", "pharmacy_name"),
    "PHARMACY_STAFF": ("pharmacy_staff", "fname"),
    "RECEPTIONIST": ("receptionist", "fullname"),
    "ADMIN": ("internal_admin", "fullname"),
}

# Which React portal each role lands in
ROLE_PORTAL = {
    "PATIENT": "patient", "DOCTOR": "doctor", "NURSE": "nurse", "HOSPITAL": "hospital",
    "LAB": "lab", "LAB_STAFF": "lab-staff", "PHARMACY": "pharmacy",
    "PHARMACY_STAFF": "pharmacy-staff", "RECEPTIONIST": "reception", "ADMIN": "internal-admin",
}


def detect_role(permanent_id: str):
    pid = (permanent_id or "").strip().upper()
    for prefix, role in PREFIX_TO_ROLE:
        if pid.startswith(prefix):
            return role
    return None
