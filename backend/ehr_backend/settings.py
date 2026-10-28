import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "True").lower() == "true"
ALLOWED_HOSTS = [h.strip() for h in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")]

# NOTE: django.contrib.auth/admin/sessions are intentionally NOT installed, so
# migrate never creates extra tables inside your existing EHR database.
INSTALLED_APPS = ["corsheaders", "rest_framework", "accounts", "patient", "booking", "doctor", "reception", "hospital", "admins"]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "ehr_backend.urls"
WSGI_APPLICATION = "ehr_backend.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("DB_NAME", "synalink"),
        "USER": os.getenv("DB_USER", "root"),
        "PASSWORD": os.getenv("DB_PASSWORD", "root"),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "3306"),
        "OPTIONS": {"charset": "utf8mb4"},
    }
}

# The Java app stored naive local timestamps, so keep the same behaviour.
TIME_ZONE = "Asia/Kolkata"
USE_TZ = False
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authn.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["accounts.authn.IsAuthenticatedUser"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
}

JWT_LIFETIME_MINUTES = int(os.getenv("JWT_LIFETIME_MINUTES", "60"))
DEV_SKIP_PATIENT_OTP = os.getenv("DEV_SKIP_PATIENT_OTP", "False").lower() == "true"

AES_KEY_FILE = BASE_DIR / os.getenv("AES_KEY_FILE", "keystore/aes_key.hex")
LEGACY_AES_IV = os.getenv("LEGACY_AES_IV", "root@1234@123456")

# ---- OTP delivery (Phase 2) ----
# DEV_ECHO_OTP prints the OTP in the Django console instead of needing WhatsApp/SMTP. Never enable in production.
DEV_ECHO_OTP = os.getenv("DEV_ECHO_OTP", "False").lower() == "true"
WHATSAPP_API_URL = os.getenv("WHATSAPP_API_URL", "")
WHATSAPP_API_KEY = os.getenv("WHATSAPP_API_KEY", "")
WHATSAPP_CAMPAIGN = os.getenv("WHATSAPP_CAMPAIGN", "patient otp generation method")
WHATSAPP_USERNAME = os.getenv("WHATSAPP_USERNAME", "")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() == "true"
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "noreply@cobalt.local")

OTP_VALID_MINUTES = 10
OTP_MAX_ATTEMPTS = 3
OTP_RESEND_SECONDS = 30
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024

# Phase 4
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")      # used in "set your password" mails
SUPER_ADMIN_ID = os.getenv("SUPER_ADMIN_ID", "basharat.sultana@mepstra.com")  # legacy setup.properties "superadmin"
PENDING_UPLOAD_DIR = BASE_DIR / os.getenv("PENDING_UPLOAD_DIR", "uploads/pending")  # ID proofs waiting for patient approval
