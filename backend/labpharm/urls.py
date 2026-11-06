from django.urls import path

from . import register, views

urlpatterns = [
    path("org/dashboard", views.dashboard),
    path("org/profile", views.profile),
    path("org/profile/file/<str:col>", views.profile_file),
    path("org/orders", views.orders),
    path("org/orders/<int:order_id>", views.order_detail),
    path("org/orders/<int:order_id>/status", views.order_status),
    path("org/orders/<int:order_id>/report", views.lab_report_upload),
    path("org/orders/<int:order_id>/report/file", views.lab_report_download),
    path("org/staff", views.staff),
    path("org/staff/<str:pid>", views.staff_detail),
    path("org/staff/<str:pid>/file", views.staff_file),
    path("org/staff/<str:pid>/approve", views.staff_approve),
    path("org/affiliations", views.affiliations),
    path("org/affiliations/<str:hid>/request", views.aff_request),
    path("org/affiliations/<str:hid>/accept", views.aff_accept),
    path("org/affiliations/<str:hid>/reject", views.aff_reject),
    # public registrations
    path("public/register/lab", register.register_lab),
    path("public/register/pharmacy", register.register_pharmacy),
    path("public/register/patient", register.patient_start),
    path("public/register/patient/resend", register.patient_resend),
    path("public/register/patient/verify", register.patient_verify),
    # reception / hospital desk
    path("desk/register-patient", register.desk_patient_start),
    path("desk/register-patient/resend", register.desk_patient_resend),
    path("desk/register-patient/verify", register.desk_patient_verify),
    path("desk/directory/<str:kind>", register.directory),
    path("desk/directory/<str:kind>/<str:pid>", register.directory_detail),
    path("reception/profile", register.reception_profile),
    path("reception/profile/govtid", register.reception_govtid),
]
