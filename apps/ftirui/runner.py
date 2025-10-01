# apps/ftirui/runner.py
import os
import threading
import time

import webview

# Point Django at your settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ftirui.settings")
os.environ.setdefault("PYTHONUNBUFFERED", "1")  # cleaner logs

def run_django():
    # Start Django dev server programmatically (no manage.py, no autoreloader)
    import django
    django.setup()
    from django.core.management import call_command
    call_command("runserver", "127.0.0.1:8765", use_reloader=False, verbosity=1)

def main():
    t = threading.Thread(target=run_django, daemon=True)
    t.start()
    # give it a moment to bind the port
    time.sleep(1.5)
    webview.create_window("FT-IR UI", "http://127.0.0.1:8765", width=1200, height=800)
    webview.start()

if __name__ == "__main__":
    main()
