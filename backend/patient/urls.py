from django.urls import path
from . import otp, views

urlpatterns = [
    path("patient/otp/send", otp.send_otp),
    path("patient/otp/verify", otp.verify_otp),
    path("patient/dashboard", views.dashboard),
    path("patient/profile", views.profile),
    path("patient/appointments", views.appointments),
    path("patient/appointments/<str:appointment_id>/cancel", views.cancel_appointment),
    path("patient/allergies", views.allergies),
    path("patient/allergies/add", views.add_allergy),
    path("patient/allergies/status", views.set_allergy_status),
    path("patient/vaccinations", views.vaccinations),
    path("patient/vaccinations/add", views.add_vaccination),
    path("patient/vaccinations/file", views.vaccination_file),
    path("patient/problems", views.problems),
    path("patient/medications", views.medications),
    path("patient/lab-orders", views.lab_orders),
    path("patient/lab-orders/report", views.lab_report),
    path("patient/notifications", views.notifications),
    path("patient/notifications/read", views.mark_notifications_read),
]

from . import extra  # noqa: E402

urlpatterns += [
    path("patient/access", extra.access),
    path("patient/today", extra.today),
    path("patient/profile/govtid", extra.govtid_file),
    path("patient/children", extra.children),
    path("patient/children/appointments", extra.child_appointments),
    path("patient/children/appointments/<str:appointment_id>/cancel", extra.child_cancel),
    path("patient/children/appointments/<str:appointment_id>/reschedule", extra.child_reschedule),
    path("patient/children/<str:child_id>/govtid", extra.child_govtid),
    path("patient/children/<str:child_id>/book", extra.child_book),
    path("patient/case-files", extra.case_files),
    path("patient/case-files/<str:apnt_id>", extra.case_file_detail),
    path("patient/past-reports", extra.past_reports),
    path("patient/past-reports/file", extra.past_report_file),
    path("patient/orders/<str:kind>/<int:order_id>", extra.order_detail),
    path("patient/directory/<str:kind>", extra.directory),
    path("patient/medications/reorder", extra.reorder_medicine),
    path("patient/lab-orders/reorder", extra.reorder_lab),
    path("patient/referrals", extra.referrals),
    path("patient/referrals/<str:apnt_id>/accept", extra.accept_referral),
    path("patient/referrals/<str:apnt_id>/cancel", extra.cancel_referral),
    path("patient/referrals/<str:apnt_id>/book", extra.book_referral),
    path("patient/notifications/<int:notification_id>/respond", extra.respond_change),
]
