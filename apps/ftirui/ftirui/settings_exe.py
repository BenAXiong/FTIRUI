from .settings import *
import os, sys
from pathlib import Path

# ---- Runtime mode detection ----
MEIPASS = getattr(sys, "_MEIPASS", None)
# Project folder (...\apps\ftirui\ftirui)
PROJECT_DIR = Path(__file__).resolve().parent
# Source root (...\apps\ftirui)
SRC_ROOT = PROJECT_DIR.parent
# When frozen, bundled files live under _MEIPASS
BUNDLE_BASE = Path(MEIPASS) if MEIPASS else None

DEBUG = False
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

# ---- Templates (ensure your app templates are visible) ----
_app_templates = (
    (BUNDLE_BASE / "ft" / "templates")
    if BUNDLE_BASE
    else (SRC_ROOT / "ft" / "templates")
)
TEMPLATES[0]["DIRS"] = [str(_app_templates)] + TEMPLATES[0].get("DIRS", [])

# ---- Static files (served by Whitenoise from the same app path) ----
MIDDLEWARE = [
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *[m for m in MIDDLEWARE if m != "whitenoise.middleware.WhiteNoiseMiddleware"],
]
STATIC_URL = "/static/"
_app_static = (
    (BUNDLE_BASE / "ft" / "static")
    if BUNDLE_BASE
    else (SRC_ROOT / "ft" / "static")
)
STATICFILES_DIRS = [str(_app_static)]
STATIC_ROOT = str(PROJECT_DIR / "staticfiles")  # harmless placeholder
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# ---- Media (must be writable on end-user PCs) ----
try:
    from appdirs import user_data_dir
    MEDIA_ROOT = Path(user_data_dir("ML-FTIR", "BenH")) / "media"
except Exception:
    MEDIA_ROOT = Path.home() / "AppData" / "Local" / "ML-FTIR" / "media"
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

# ---- Local desktop app: stick to HTTP; silence HTTPS-only checks ----
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    # long random string (meets check W009 so it's not weak)
    "o$ZJ3lP3kG4v8qX2Gm!b2t@N7yKp9wQ1L5sV8rB2mC7dE0fH6jR9uY4xT8zQ2nM1"
)

# We intentionally do NOT force HTTPS for a local-only desktop tool:
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_HSTS_SECONDS = 0

# Silence deploy checks that don't apply to a local HTTP desktop app
SILENCED_SYSTEM_CHECKS = [
    "security.W004",  # HSTS
    "security.W008",  # SECURE_SSL_REDIRECT
    "security.W012",  # SESSION_COOKIE_SECURE
    "security.W016",  # CSRF_COOKIE_SECURE
]
