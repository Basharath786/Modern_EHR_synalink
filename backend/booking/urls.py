from django.urls import path
from . import views

urlpatterns = [
    path("booking/symptoms", views.symptoms),
    path("booking/doctors", views.doctors),
    path("booking/doctors/<str:doctor_id>/slots", views.doctor_slots),
    path("booking/book", views.book),
    path("booking/appointments/<str:appointment_id>/reschedule", views.reschedule),
]
