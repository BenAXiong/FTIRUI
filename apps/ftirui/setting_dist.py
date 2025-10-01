from .settings import *
import os
from pathlib import Path

DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

# Rely on app template loader
for cfg in TEMPLATES:
    cfg["APP_DIRS"] = True

# User-writable media dir
try:
    from appdirs import user_data_dir
    MEDIA_ROOT = Path(user_data_dir("ML-FTIR", "BenH")) / "media"
except Exception:
    MEDIA_ROOT = Path.home() / "AppData" / "Local" / "ML-FTIR" / "media"
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

# Local desktop: no HTTPS enforcement
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "use-a-long-random-string")
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_HSTS_SECONDS = 0