from django.urls import include, path

urlpatterns = [
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("patient.urls")),
    path("api/v1/", include("booking.urls")),
    path("api/v1/", include("doctor.urls")),
    path("api/v1/", include("reception.urls")),
    path("api/v1/", include("hospital.urls")),
    path("api/v1/", include("admins.urls")),
]
