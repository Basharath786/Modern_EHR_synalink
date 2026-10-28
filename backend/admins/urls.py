from django.urls import path

from . import views

urlpatterns = [
    # internal admin + super admin review of hospitals / labs / pharmacies
    path("admin/dashboard", views.dashboard),
    path("admin/entities/<str:kind>", views.entities),
    path("admin/entities/<str:kind>/<str:pid>", views.entity_detail),
    path("admin/entities/<str:kind>/<str:pid>/approve", views.entity_approve),
    path("admin/entities/<str:kind>/<str:pid>/file/<str:col>", views.entity_file),
    path("admin/profile", views.my_profile),
    path("admin/profile/govtid", views.my_file),
    # super admin
    path("superadmin/status", views.sa_status),
    path("superadmin/setup", views.sa_setup),
    path("superadmin/code/send", views.sa_send_code),
    path("superadmin/code/check", views.sa_check_code),
    path("superadmin/password", views.sa_set_password),
    path("superadmin/login", views.sa_login),
    path("superadmin/change-password", views.sa_change_password),
    path("superadmin/admins", views.admins),
    path("superadmin/admins/<str:ident>", views.admin_detail),
    path("superadmin/admins/<str:ident>/govtid", views.admin_file),
    path("superadmin/admins/<str:ident>/approve", views.admin_approve),
    path("superadmin/admins/<str:ident>/status", views.admin_status),
    path("superadmin/users/<str:kind>", views.users),
    path("superadmin/users/<str:kind>/<str:ident>", views.user_detail),
    path("superadmin/users/<str:kind>/<str:ident>/file/<str:col>", views.user_file),
    # public
    path("public/reference", views.reference),
    path("public/register/hospital", views.register_hospital),
    path("public/register/internal-admin", views.register_internal_admin),
]
