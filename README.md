# Cobalt EHR – Django + React (Phase 1: Foundation & Login)

Same MySQL database as the Java app (schema untouched). Django never runs `migrate`
against it, so your existing 50 tables and data stay exactly as they are.

## Requirements
- Python 3.11+  ·  Node.js 18+  ·  MySQL 8 with your dump imported

## 1. Database (skip if already imported)
```
mysql -u root -p -e "CREATE DATABASE ehr CHARACTER SET utf8mb4"
mysql -u root -p ehr < Dump20261022.sql
```

## 2. Backend (Django)  ->  http://127.0.0.1:8000
```
cd backend
python -m venv venv
venv\Scripts\activate            (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env           (Mac/Linux: cp .env.example .env)
```
Edit `.env`: set `DB_PASSWORD` and a long random `DJANGO_SECRET_KEY`. Then:
```
python manage.py runserver
```

## 3. Frontend (React + Vite)  ->  http://localhost:5173
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 and sign in with an existing ID/password from your data.

## What is included in Phase 1
| Endpoint | Replaces (Java) |
|---|---|
| POST /api/v1/auth/login | v1/login (role auto-detected from ID prefix) |
| POST /api/v1/auth/change-password | v1/changePassword |
| GET  /api/v1/auth/me | - |

Ported rules: AES password compatibility (same AES key (from cobalt.jks) + IV, so existing passwords work),
3 wrong attempts = 2-minute lock, 30-day temp-password validity, 90-day password expiry
(365 for patients), login-time tracking, password policy (8-32, upper/lower/digit/special).

## Deliberate differences from the Java app
- Role is derived from the ID prefix on the server (Java trusted the role sent by the browser).
- Temporary-password login gets a 15-minute token that can only change the password
  (the old UI kept the password in localStorage).
- Token lives in sessionStorage and expires after `JWT_LIFETIME_MINUTES`.
- New password must differ from the current one (small addition).

## Not in Phase 1 (coming next)
Patient OTP login (Phase 2; until then patients see "otp_required"), forgot-password OTP flow,
super-admin login, password-changed email, WhatsApp notifications.

## Security
`keystore/aes_key.hex`, `keystore/cobalt.jks`, `.env` and your SQL dump must never be committed or shared.
Passwords are stored with reversible AES + a fixed IV (legacy). It is kept only so existing
accounts keep working; moving to salted hashes is recommended before go-live.
