from django.urls import path
from . import setpw, views

urlpatterns = [
    path("auth/login", views.login_view),
    path("auth/change-password", views.change_password_view),
    path("auth/me", views.me_view),
    path("auth/set-password/request", setpw.request_code),
    path("auth/set-password/verify", setpw.verify_code),
    path("auth/set-password/complete", setpw.complete),
]
