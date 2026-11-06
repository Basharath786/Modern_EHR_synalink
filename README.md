# Cobalt EHR – Django + React (Phases 1–6)

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

## Phase 2 (core) - Patient portal
Login now has the patient OTP step: password -> OTP (WhatsApp/email) -> portal.

| Endpoint | Replaces (Java) |
|---|---|
| POST /api/v1/patient/otp/send, /otp/verify | resendPatientOtp, patient/verifyLoginOtp |
| GET  /api/v1/patient/dashboard, /profile | patientAppointmentCount, listAllDetails |
| GET  /api/v1/patient/appointments, POST .../{id}/cancel | listPatientAppointments, patientCancelAppointment |
| GET/POST /api/v1/patient/allergies... | listPatientAddAllergiesInfo, patientAddAllergies |
| GET/POST /api/v1/patient/vaccinations... (file upload/view) | listPatientVaccineReportsInfo, patientAddVaccination, downloadVaccineReportFile |
| GET /api/v1/patient/problems, medications, lab-orders (+report file) | problems / Rx / lab record pages |
| GET/POST /api/v1/patient/notifications | patient_notifications list + mark read |

### OTP setup (important)
Edit `backend/.env`:
- Local testing: `DEV_ECHO_OTP=True` - the OTP is printed in the Django console window (no WhatsApp/SMTP needed).
- Real delivery: set `DEV_ECHO_OTP=False` and fill `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_USERNAME`
  (and `EMAIL_*` for email). Copy them from your Java `PatientOTPUtil`. Never put them in the frontend.
- OTP rules kept from Java: 6 digits, valid 10 minutes, max 3 attempts. Added: 30-second resend cooldown.

## Phase 3 (core) - Booking engine, Doctor portal, Reception portal
| Area | Endpoints |
|---|---|
| Booking (patient + reception) | GET /booking/doctors, /booking/doctors/{id}/slots, /booking/symptoms; POST /booking/book, /booking/appointments/{id}/reschedule |
| Doctor | GET /doctor/dashboard, /doctor/appointments?scope=today/upcoming/past/all, /doctor/appointments/{id}, /doctor/patients/{id}, /doctor/slots; POST .../complete, .../cancel |
| Reception | GET /reception/dashboard, /reception/appointments?scope=&q=, /reception/patients?q=; POST .../cancel (+ booking/reschedule above) |

Rules ported from Java: slots = weekly default slots for the next 16 days, adjusted by `active_slots`
(add / cancel); a MySQL named lock + duplicate check prevents double booking; reschedule sets
`consult-rescheduled`; past unfinished appointments become `dns` (missed).
Improvements: slots that already started today are hidden; a patient cannot hold two appointments at
the same time; a doctor can open only patients they have an appointment with; reception sees and
books only for its own hospital; all SQL is parameterized (the Java code concatenated strings).

Receptionist/doctor accounts that still have an empty password (never completed the "set password"
link) cannot log in yet - that first-time set-password flow comes with the admin phase.

## Phase 3B - Doctor consultation
Open an appointment -> "Consultation" tab:
| Tool | Writes to (same tables as Java) |
|---|---|
| Problems (ICD search `assessment_database`), Flags | patient_problems, patient_flags |
| Allergies (allergen + severity + reaction) | patient_allergies |
| Prescription -> pharmacy order | pharmacy_orders + patient_medicines (one shared order id) |
| Lab tests -> lab order (urgent / repeat) | lab_order + patient_labtests |
| Loadouts (saved medicine / lab templates) | medicines_loadout_table, lab_loadout_table |
| Follow-up booking | appointment (type `followup`) |
| Mark problem/flag/allergy active or inactive | status columns |
| Edit medical background | patient / child_reg history columns |

Rules: only the doctor who owns the appointment can write; cancelled or missed appointments are
read-only; pharmacy and lab must be affiliated with the doctor's hospital (`hospital.affiliated_*_list`);
duplicate active problems/flags are skipped; field lengths follow the database columns; orders are
created in one transaction. Patients see the new medicines and lab orders instantly in their portal.

### Coming in Phase 3C
Referrals (doctor sends / accepts / cancels referral appointments), editing doctor slots (create or
cancel active slots), reception patient registration/approval, nurse portal, order notifications.

### Coming in Phase 2B
Book / reschedule appointment (needs doctor slots), children (register + list + appointments),
case files and past-report upload, referral accept/cancel, notification approve/reject
(change-request flow), cancellation emails.

## Deliberate differences from the Java app
- Role is derived from the ID prefix on the server (Java trusted the role sent by the browser).
- Temporary-password login gets a 15-minute token that can only change the password
  (the old UI kept the password in localStorage).
- Token lives in sessionStorage and expires after `JWT_LIFETIME_MINUTES`.
- OTP state is looked up by patient ID (Java used the mobile number, which clashes when two patients share a number).
- Cancel reason is limited to 30 characters because the `appointment.pat_cancel_reason` column is varchar(30).
- New password must differ from the current one (small addition).

## Not in Phase 1 (coming next)
Forgot-password OTP flow,
super-admin login, password-changed email, WhatsApp notifications.

## Security
`keystore/aes_key.hex`, `keystore/cobalt.jks`, `.env` and your SQL dump must never be committed or shared.
Passwords are stored with reversible AES + a fixed IV (legacy). It is kept only so existing
accounts keep working; moving to salted hashes is recommended before go-live.

## Phase 3C - Doctor + Patient complete (incl. 3D body model)
Extract over the previous folder. No new packages (backend or frontend).

### Doctor
| Screen | Replaces (old UI / Java) |
|---|---|
| Patient Examination `/app/visit/:id` - Vitals, Subjective (symptom questions + 3D model "select area"), System Review (8 systems, 1699 options, organ models), Assessment (summary w/ status toggles, flags, problems + frequently used, allergies, Past History modal), Plan (medicines, lab tests, per-problem loadouts, drug interactions), Final (send orders to affiliated/all pharmacies & labs, diagnosis, status Completed / Referral / Follow-up, preview, Send reports) | treatment/patient-visit.html, sendPatientReportData, patientReportFile, updateAppointmentStatus, sendReferralAppointment, getMostUsedProblems, checkDrugInteractionsBatch, delete*Loadout, add/updateSymptomsList |
| Appointments tabs (Consult / Rescheduled / Follow up / Referral / Completed / DNS / Cancelled), Referrals (incoming accept/decline, outgoing, booked) | appointments.html |
| My Slots: create / add / remove / clear date slots, weekly schedule | update-active-slots.html, createActiveDoctorSlot, rescheduleActiveSlot, deleteEntireSlotsForDate |
| Patient history files, Case file (print / PDF), My Profile, sidebar today's queue, 15-min idle logout | patient-profile.html, report-file.html, doctor-details.html |

### Patient
Booking with the human body model (self or child), Children (register with Aadhaar + ID proof, list), Child appointments,
Case files & past reports (upload PDF <1 MB, self/child), referral accept/cancel/book, repeat medicine / lab orders to any
pharmacy / lab, prescription view & print, Self/Child tabs on all records, Notifications Approve/Reject (change requests),
access restriction until the Permanent ID is validated (`patient.approved_by`), govt ID view, today's appointments.

### E-mails
Set `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` in `.env` to send booking / cancel / referral / order / slot mails (otherwise only logged).

### Deliberate differences
- Follow-up creates a NEW appointment (Java moved the same appointment, which blocked a second case file).
- Past `referral_appointment` visits are not turned into "dns".
- Options without a legacy auto-text phrase (≈2%) still appear in the case file as "Question: Answer".
- The hidden "Objective symptoms" tab of the old page stays hidden.

## Phase 4 - Hospital portal, internal admin, super admin, set-password
Extract over the previous folder. No new packages. Add to `backend/.env` (see `.env.example`):
`FRONTEND_URL=http://localhost:5173` (link in approval mails) and `SUPER_ADMIN_ID=<super admin e-mail>`.
Restart Django after extracting.

### First-time "Set password" (all roles) - `/set-password`
Legacy registration created hospitals, doctors, receptionists, labs, pharmacies and staff with an **empty**
password, then mailed a "Set Password & Login" link after approval. Those accounts could not log in.
Now: login answers `password_not_set` and shows **Set my password** → enter Permanent ID → 6-digit code to the
registered e-mail / WhatsApp (5 min, 3 tries, stored hashed in `password_reset_otp`) → choose password.
The account must be approved first (doctor/receptionist `status=APPROVED`, hospital/lab/pharmacy `approved_by`,
internal admin `ACTIVE`). The same page is the **forgot password** flow. Local testing: with
`DEV_ECHO_OTP=True` the code is printed in the Django console.
*Example:* REC87420 → hospital HOS25712 approves it (Staff approval) → `/set-password?id=REC87420`.

| Portal | Screens (legacy page) |
|---|---|
| Public | Hospital registration (register/hospital-registration.html), Internal admin sign-up (internal-admin-register.html), Set / forgot password |
| Hospital (HOS…) | Dashboard counts, Appointments + Book (same as reception, hospital-scoped), Departments, Doctors / Nurses / Receptionists (list, register with documents, details, ID / MCI proofs), Staff approval (sends set-password mail), doctor weekly default slots 15/30/60 min (createDoctorSlot, rescheduleDefaultSlot, deleteEntireSlotsForDay), Labs & Pharmacies (request, outgoing, incoming accept/reject with reason, affiliated, cancelled), Patient validation, Profile |
| Hospital + Reception | Patient validation: validate Permanent ID (approvePatientForCaseSheet), request change incl. new ID proof (requestPatientChange → patient approves in Notifications), temporary registrations hold (max 3) / reject / validate |
| Internal admin (ADMIN…) | Dashboard counts, Hospitals / Labs / Pharmacies pending + approved, documents, Approve (approved_by + set-password mail), Profile. Inactive admins cannot log in |
| Super admin (`/super-admin`) | First-time setup (ID check → 4-digit code → password), login (3 wrong = locked until reset), forgot password, change password, internal admin approve + activate/deactivate, hospital/lab/pharmacy review, read-only directory of all users |

### Deliberate differences
- Legacy v1/setPassword accepted only a Permanent ID (account takeover); replaced by code + one-time token.
- Validated temporary patients, approved internal admins and new nurses get the set-password link instead of a mailed plain-text temporary password.
- Removing default slots that have upcoming bookings is blocked (cancel/reschedule first); new slots may not overlap existing ones.
- Department names come from the hospital's specialities (the legacy dropdown was never filled); duplicates blocked.
- Super admin password max 15 characters (`superadmin.pswrd` is varchar(32)); legacy expiry check never triggered, so none here.
- Legacy pages called removePermanentDetails / generatePermanentId / checkAllValidations / superAdminChangePassword, which never existed in Java; only change-password was added.
- Reception "Register Patient" (with OTP) comes with Phase 5.

## Phase 5 - Laboratory, pharmacy, their staff, patient registration
Extract over the previous folder and restart Django. No new packages or settings.

| Portal | Screens (legacy page) |
|---|---|
| Public | Laboratory registration (register/lab-registration.html), Pharmacy registration (pharmacy-registration.html), Patient sign-up with mobile OTP + password (patient-registration → patient-otp-verification → patient-set-password) |
| Lab (LAB…) | Dashboard counts (labOrderCount, labStaffCount), Lab orders: New → Confirm → Sample collected → Upload report (= Completed), cancel with reason at each step, per test or whole order, view reports; Lab staff register / approve (set-password mail) / details; Hospital affiliations (request, requested, pending accept/reject, affiliated, cancelled); Patient validation; Profile |
| Lab staff (LBST…) | Dashboard, Lab orders (same actions), Profile |
| Pharmacy (PHAR…) | Dashboard, Medicine orders: New → Confirm → Delivered, cancel with reason (CANCELLED / CONFIRMATION-CANCELLED), per medicine or whole order; Pharmacy staff; Hospital affiliations; Patient validation; Profile |
| Pharmacy staff (PHST…) | Dashboard, Medicine orders, Profile |
| Reception | Register patient (OTP to patient, then optional "Validate ID now"), Hospital directory (doctors incl. weekly slots, nurses, receptionists, departments), My profile |
| Hospital | Register patient |

Every status change mails the patient and the lab / pharmacy (legacy labNotificationToPatient, notificationToLabAdmin, confirmationNotificationToPatient...). The patient sees reports per test in Lab Records.
Staff and orgs created here activate their account through `/set-password` (Phase 4).

### Deliberate differences
- Patient sign-up details wait in `patient_temp` (status `OTP`) until the OTP is verified; legacy inserted the patient first and left half-registered rows. OTP 10 minutes, 3 tries, resend after 30 s.
- Legacy `patient/setPassword` accepted only a Patient ID; the sign-up hands a one-time token to the password step instead. Desk-registered patients get the set-password link by e-mail.
- Lab tests can be completed only by uploading the report (legacy also allowed "complete" without a file in one path).
- `civilno` is the lab / pharmacy primary key, so duplicates are rejected with a message instead of a server error.
- Testing tip: some seeded accounts (e.g. LAB78270) have expired passwords; use `/set-password` to reset.

## Phase 6 - Public website, registration status, integrations, production
Extract over the previous folder and restart Django. No new Python/npm packages for development
(`gunicorn` only for production, in `backend/requirements-prod.txt`).

| Area | What (legacy page / code) |
|---|---|
| Public website | Home page with live counters (index.html), Find doctors / hospitals / laboratories / pharmacies with search + state/city/speciality filters (doctors-list, hospitals-list, labs-list, pharmacy-list). Only approved organisations and public fields are shown |
| Registration status | `/registration-status`: Permanent ID → validated / pending + list of validation centres; temporary ID on hold → hold reason, verify a code sent to the registered e-mail, upload a new Govt ID (max 3 uploads, then back to validation; the staff member who put it on hold is mailed) (profile-status.html, profile-update.html: sendingVerificationCodeToPatient, checkVerificationCodeOfPatient, updateValidPatientInfo) |
| Login | "Login attempts remaining: N" after a wrong password (allUserLoginStatus); expired / temporary-expired passwords show a reset button; expired password triggers the WhatsApp `password_expired_all_portals` notice + e-mail (once a day); password-changed e-mail |
| WhatsApp | `Create_user_idss` "your Permanent ID" message after hospital, lab, pharmacy, doctor, nurse, receptionist, lab staff and pharmacy staff registration (legacy send…PermanentIdViaWhatsApp). Campaign names are configurable in `.env` |
| Super admin → Integrations | SMTP and WhatsApp configuration status, test e-mail / test WhatsApp, warning when development switches are on |
| PWA | Installable app (manifest, icon, service worker caching the app shell; API calls are never cached) - replaces legacy sw.js |

### Production deployment (Docker)
```
cp backend/.env.example backend/.env      # DB_HOST=db, DJANGO_DEBUG=False, DEV_ECHO_OTP=False, DEV_SKIP_PATIENT_OTP=False,
                                          # DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, CORS/CSRF origins, FRONTEND_URL, SMTP, WhatsApp
mkdir -p backend/keystore && cp <aes_key.hex> backend/keystore/   # same key as the Java app
cp <your dump>.sql deploy/ehr.sql         # loaded once into the empty database volume
docker compose up -d --build              # http://localhost:8080  (nginx serves React and proxies /api to gunicorn)
```
Without Docker: `pip install -r requirements.txt -r requirements-prod.txt`, run
`gunicorn ehr_backend.wsgi:application -b 0.0.0.0:8000 -w 3`, `npm run build`, and serve `frontend/dist`
with any web server that proxies `/api/` to port 8000 (see `frontend/nginx.conf`). Put TLS in front and set
`BEHIND_HTTPS_PROXY=True`. `.gitignore` keeps `.env`, `keystore/`, uploads and SQL dumps out of git.

### Go-live checklist
- Development switches off (Super admin → Integrations shows a warning while they are on).
- SMTP + WhatsApp test messages succeed from the Integrations screen.
- Seeded accounts with expired passwords reset through `/set-password`.
- Recommended next step (not a legacy feature): move from reversible AES passwords to salted hashes once the Java app is retired.

### Coverage note
The nurse portal had no screens in the legacy app, so it still shows only the dashboard. Legacy endpoints never
called by any page (e.g. drug/pharma catalogue admin loaders) and dead calls (removePermanentDetails, generatePermanentId,
checkAllValidations, superAdminChangePassword...) were not ported; every page in webui/ now has a React equivalent.
