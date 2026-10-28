"""Appointment e-mails (Java appointmentNotificationToPatient / notificationToDoctorForBookedAppointment /
*CancelAppointment*Notification / reschedule notifications). Best effort, see accounts.mailer."""
from accounts import mailer
from accounts.db import one


def _appt(apid):
    return one("SELECT appointmentid, permanentid, fullname, email, doctorid, doctor_name, deptname, hospital_name, date_of_booking, "
               "time_of_booking FROM appointment WHERE appointmentid=%s", [apid]) or {}


def _lines(a):
    return [f"Appointment ID: <b>{a.get('appointmentid')}</b>", f"Patient: {mailer.e(a.get('fullname'))} ({a.get('permanentid')})",
            f"Doctor: Dr. {mailer.e(a.get('doctor_name'))} - {mailer.e(a.get('deptname'))}", f"Hospital: {mailer.e(a.get('hospital_name'))}",
            f"Date / time: <b>{a.get('date_of_booking')} {a.get('time_of_booking')}</b>"]


def booked(apid):
    a = _appt(apid)
    mailer.send(a.get("email"), "Appointment booked", "Appointment confirmed", _lines(a))
    mailer.send(mailer.doctor_email(a.get("doctorid")), "New appointment booked", "New appointment", _lines(a))


def rescheduled(apid):
    a = _appt(apid)
    mailer.send(a.get("email"), "Appointment rescheduled", "Appointment rescheduled", _lines(a))
    mailer.send(mailer.doctor_email(a.get("doctorid")), "Appointment rescheduled", "Appointment rescheduled", _lines(a))


def cancelled(apid, reason, by):
    a = _appt(apid)
    lines = _lines(a) + [f"Cancelled by: {mailer.e(by)}", f"Reason: {mailer.e(reason)}"]
    mailer.send(a.get("email"), "Appointment cancelled", "Appointment cancelled", lines)
    mailer.send(mailer.doctor_email(a.get("doctorid")), "Appointment cancelled", "Appointment cancelled",
                lines + ["This slot is available for booking again."])
