from django.urls import path
from . import views

urlpatterns = [
    path("doctor/dashboard", views.dashboard),
    path("doctor/appointments", views.appointments),
    path("doctor/appointments/<str:appointment_id>", views.appointment_detail),
    path("doctor/appointments/<str:appointment_id>/complete", views.complete),
    path("doctor/appointments/<str:appointment_id>/cancel", views.cancel),
    path("doctor/patients/<str:patient_id>", views.patient_view),
    path("doctor/slots", views.my_slots),
]

from . import consult  # noqa: E402

urlpatterns += [
    path("doctor/appointments/<str:appointment_id>/consultation", consult.consultation),
    path("doctor/appointments/<str:appointment_id>/problems", consult.add_problems),
    path("doctor/appointments/<str:appointment_id>/flags", consult.add_flags),
    path("doctor/appointments/<str:appointment_id>/allergies", consult.add_allergies),
    path("doctor/appointments/<str:appointment_id>/status", consult.set_status),
    path("doctor/appointments/<str:appointment_id>/prescription", consult.prescribe),
    path("doctor/appointments/<str:appointment_id>/lab-order", consult.lab_order),
    path("doctor/appointments/<str:appointment_id>/followup", consult.followup),
    path("doctor/patients/<str:patient_id>/history", consult.update_history),
    path("doctor/catalog/problems", consult.catalog_problems),
    path("doctor/catalog/flags", consult.catalog_flags),
    path("doctor/catalog/allergies", consult.catalog_allergies),
    path("doctor/catalog/medicines", consult.catalog_medicines),
    path("doctor/catalog/lab-tests", consult.catalog_lab_tests),
    path("doctor/loadouts/<str:kind>", consult.loadouts),
]

from . import manage, visit  # noqa: E402

urlpatterns += [
    # examination / SOAP visit
    path("doctor/appointments/<str:appointment_id>/visit", visit.visit),
    path("doctor/appointments/<str:appointment_id>/symptoms", visit.update_symptoms),
    path("doctor/appointments/<str:appointment_id>/report", visit.send_report),
    path("doctor/reports/<str:apnt_id>", visit.report_detail),
    path("doctor/patients/<str:patient_id>/case-files", visit.patient_case_files),
    path("doctor/patients/<str:patient_id>/history-files", visit.patient_history),
    path("doctor/catalog/most-used-problems", visit.most_used_problems),
    path("doctor/drug-interactions", visit.drug_interactions),
    path("doctor/loadouts/<str:kind>/delete", consult.delete_loadout),
    # referrals
    path("doctor/referrals", manage.referrals),
    path("doctor/referrals/targets", manage.referral_targets),
    path("doctor/referrals/<str:apnt_id>/accept", manage.accept_referral),
    path("doctor/referrals/<str:apnt_id>/decline", manage.decline_referral),
    # active slots
    path("doctor/slots/defaults", manage.default_slots),
    path("doctor/slots/date", manage.slot_date),
    path("doctor/slots/create", manage.create_slots),
    path("doctor/slots/add", manage.add_slots),
    path("doctor/slots/remove", manage.remove_slots),
    path("doctor/slots/clear", manage.clear_slots),
    # profile
    path("doctor/profile", manage.profile),
    path("doctor/profile/file/<str:kind>", manage.profile_file),
    # patient history files
    path("doctor/patients/<str:patient_id>/files", manage.patient_files),
    path("doctor/patients/<str:patient_id>/file/<str:kind>", manage.patient_file_download),
]
