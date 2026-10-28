from django.urls import path

from . import affiliation, patients, views

urlpatterns = [
    path("hospital/dashboard", views.dashboard),
    path("hospital/profile", views.profile),
    path("hospital/profile/file/<str:col>", views.profile_file),
    path("hospital/departments", views.departments),
    path("hospital/approvals", views.approvals),
    path("hospital/staff/<str:kind>", views.staff),
    path("hospital/staff/<str:kind>/<str:pid>", views.staff_detail),
    path("hospital/staff/<str:kind>/<str:pid>/approve", views.approve),
    path("hospital/staff/<str:kind>/<str:pid>/file/<str:col>", views.staff_file),
    path("hospital/doctors/<str:doctor_id>/slots", views.doctor_slots),
    path("hospital/affiliations/<str:kind>", affiliation.overview),
    path("hospital/affiliations/<str:kind>/<str:pid>/request", affiliation.send_request),
    path("hospital/affiliations/<str:kind>/<str:pid>/accept", affiliation.accept),
    path("hospital/affiliations/<str:kind>/<str:pid>/reject", affiliation.reject),
    # patient validation desk (hospital admin + receptionists)
    path("desk/patients", patients.patients),
    path("desk/patients/<str:pid>", patients.patient_detail),
    path("desk/patients/<str:pid>/govtid", patients.patient_govtid),
    path("desk/patients/<str:pid>/validate", patients.validate),
    path("desk/patients/<str:pid>/change-request", patients.change_request),
    path("desk/temp-patients", patients.temp_patients),
    path("desk/temp-patients/<str:temp_id>/file", patients.temp_patient_file),
    path("desk/temp-patients/<str:temp_id>/hold", patients.temp_hold),
    path("desk/temp-patients/<str:temp_id>/reject", patients.temp_reject),
    path("desk/temp-patients/<str:temp_id>/validate", patients.temp_validate),
]
