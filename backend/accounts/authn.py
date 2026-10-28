"""Stateless JWT auth that does not need Django's User model/tables."""
from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission


class EhrUser:
    is_authenticated = True

    def __init__(self, permanent_id, role, scope):
        self.permanent_id, self.role, self.scope = permanent_id, role, scope


def make_token(permanent_id, role, scope="full", minutes=None):
    now = datetime.now(timezone.utc)
    minutes = minutes or settings.JWT_LIFETIME_MINUTES
    payload = {"sub": permanent_id, "role": role, "scope": scope, "iat": now, "exp": now + timedelta(minutes=minutes)}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        try:
            data = jwt.decode(header[7:], settings.SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed("Session expired. Please log in again.")
        except jwt.PyJWTError:
            raise AuthenticationFailed("Invalid token.")
        return EhrUser(data["sub"], data["role"], data.get("scope", "full")), data

    def authenticate_header(self, request):
        return "Bearer"


class IsAuthenticatedUser(BasePermission):
    """Any valid token (full-scope or change-password scope)."""
    def has_permission(self, request, view):
        return bool(request.user and getattr(request.user, "is_authenticated", False))


class IsFullScope(IsAuthenticatedUser):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.scope == "full"


class IsOtpScope(IsAuthenticatedUser):
    """Token issued after the patient password step; only valid for the OTP endpoints."""
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.scope == "otp"


class IsPatient(IsFullScope):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "PATIENT"


class IsDoctor(IsFullScope):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "DOCTOR"


class IsReceptionist(IsFullScope):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "RECEPTIONIST"


class IsPatientOrReceptionist(IsFullScope):
    """Patient, or hospital front desk (receptionist or the hospital admin account)."""
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in ("PATIENT", "RECEPTIONIST", "HOSPITAL")


class IsDesk(IsFullScope):
    """Hospital front desk: receptionist or hospital admin (both are scoped to one hospital)."""
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in ("RECEPTIONIST", "HOSPITAL")


class IsHospital(IsFullScope):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "HOSPITAL"


class IsInternalAdmin(IsFullScope):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "ADMIN"


class IsSuperAdmin(IsFullScope):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "SUPER_ADMIN"


class IsAnyAdmin(IsFullScope):
    """Internal admin or super admin (both review hospitals, labs and pharmacies)."""
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in ("ADMIN", "SUPER_ADMIN")


class IsAnyClinical(IsFullScope):
    """Patient, receptionist or doctor (body-map symptom list is used by all three)."""
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in ("PATIENT", "RECEPTIONIST", "DOCTOR", "HOSPITAL")
