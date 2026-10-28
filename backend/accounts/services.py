"""Login business rules, ported 1:1 from Java LoginImpl (authenticate, lock handling,
temp-password validity, 90/365-day expiry, loginTime, changePassword)."""
import re
import time
from datetime import datetime, date

from django.db import connection, transaction

from .crypto import decrypt_password, encrypt_password
from .roles import ROLE_TABLES

LOCK_WINDOW_MS = 120_000        # 2-minute lock, same as Java
MAX_FAILED_BEFORE_RESET = 3     # 3rd wrong password locks the account
TEMP_PASSWORD_DAYS = 30         # system-generated password valid for 30 days
PASSWORD_DAYS = {"PATIENT": 365}
DEFAULT_PASSWORD_DAYS = 90

PASSWORD_POLICY = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,32}$")


def _now_ms() -> int:
    return int(time.time() * 1000)


def _one(sql, params):
    with connection.cursor() as c:
        c.execute(sql, params)
        row = c.fetchone()
        if row is None:
            return None
        return dict(zip([col[0] for col in c.description], row))


def _exec(sql, params):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.rowcount


def _update_attempt(pid, failed, locked):
    _exec("UPDATE login SET failed_attempt=%s, account_locked=%s WHERE permanentid=%s", [failed, locked, pid])


def _set_lock_time(pid, value):
    _exec("UPDATE login SET lock_time=%s WHERE permanentid=%s", [value, pid])


def authenticate(pid: str, password: str, role: str) -> str:
    """Returns: 'YES'/'NO' (value of isdefault_password) on success, or one of
    id_error | locked_account | password_error | password_expired_non_patient."""
    row = _one("SELECT * FROM login WHERE permanentid=%s", [pid])
    if row is None:
        return "id_error"

    failed = row["failed_attempt"] or 0
    lock_time = row["lock_time"] or 0
    now = _now_ms()

    if not (now > lock_time + LOCK_WINDOW_MS and failed <= 6):
        return "locked_account"

    try:
        stored_plain = decrypt_password(row["pswrd"])
    except Exception:
        stored_plain = None

    if stored_plain is not None and password == stored_plain:
        is_default = row["isdefault_password"]
        changed = row["pswrd_changed_time"]
        if role not in ("PATIENT", "ADMIN") and is_default and is_default.upper() == "NO" and changed:
            days = int((now - changed.timestamp() * 1000) / 86_400_000)
            if days > DEFAULT_PASSWORD_DAYS:
                return "password_expired_non_patient"
        _set_lock_time(pid, 0)
        _update_attempt(pid, 0, "NO")
        return is_default

    failed += 1
    if failed > MAX_FAILED_BEFORE_RESET:
        _set_lock_time(pid, 0)
        failed = 1
    if failed < MAX_FAILED_BEFORE_RESET:
        _update_attempt(pid, failed, "NO")
    else:
        _update_attempt(pid, failed, "YES")
        _set_lock_time(pid, _now_ms())
    return "password_error"


def is_default_password_valid(pid: str, role: str) -> bool:
    table, _ = ROLE_TABLES[role]
    row = _one(f"SELECT date_time FROM {table} WHERE permanentid=%s", [pid])
    if not row or not row["date_time"]:
        return False
    today = datetime.combine(date.today(), datetime.min.time())
    return int((today - row["date_time"]).total_seconds() / 86_400) <= TEMP_PASSWORD_DAYS


def is_user_password_valid(pid: str, role: str) -> bool:
    row = _one("SELECT pswrd_changed_time FROM login WHERE permanentid=%s", [pid])
    if not row or not row["pswrd_changed_time"]:
        return False
    days = int((datetime.now() - row["pswrd_changed_time"]).total_seconds() / 86_400)
    return 0 <= days <= PASSWORD_DAYS.get(role, DEFAULT_PASSWORD_DAYS)


def login_time(pid: str):
    """Records login time; returns the PREVIOUS login time (for 'last login' display)."""
    prev = _one("SELECT systemLoginTime FROM login WHERE permanentid=%s", [pid])
    _exec("UPDATE login SET systemLoginTime=%s WHERE permanentid=%s", [datetime.now(), pid])
    return prev["systemLoginTime"] if prev else None


def profile(pid: str, role: str) -> dict:
    table, name_expr = ROLE_TABLES[role]
    row = _one(f"SELECT {name_expr} AS name FROM {table} WHERE permanentid=%s", [pid])
    return {"name": (row or {}).get("name") or pid}


def change_password(pid: str, role: str, current: str, new: str):
    """Returns (ok, error_code)."""
    row = _one("SELECT pswrd FROM login WHERE permanentid=%s", [pid])
    if not row:
        return False, "id_error"
    try:
        if decrypt_password(row["pswrd"]) != current:
            return False, "wrong_current_password"
    except Exception:
        return False, "wrong_current_password"
    if new == current:
        return False, "same_password"
    if not PASSWORD_POLICY.match(new):
        return False, "weak_password"

    encrypted = encrypt_password(new)
    table, _ = ROLE_TABLES[role]
    with transaction.atomic():
        _exec(f"UPDATE {table} SET pswrd=%s WHERE permanentid=%s", [encrypted, pid])
        _exec(
            "UPDATE login SET pswrd=%s, pswrd_changed_time=%s, isdefault_password='NO' WHERE permanentid=%s",
            [encrypted, datetime.now(), pid],
        )
    # TODO (Phase 6): send the "password changed" email like Java notifyPasswordChange()
    return True, None
