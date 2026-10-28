from django.urls import path
from . import views

urlpatterns = [
    path("reception/dashboard", views.dashboard),
    path("reception/appointments", views.appointments),
    path("reception/appointments/<str:appointment_id>/cancel", views.cancel),
    path("reception/patients", views.patient_search),
]
