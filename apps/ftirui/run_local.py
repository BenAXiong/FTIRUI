import os, socket, threading, webbrowser
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ftirui.settings_dist")

import django
from django.core.management import call_command

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0))
    _, port = s.getsockname(); s.close(); return port

def main():
    django.setup()
    port = free_port()
    url = f"http://127.0.0.1:{port}"
    threading.Timer(0.8, lambda: webbrowser.open_new(url)).start()
    call_command("runserver", f"127.0.0.1:{port}", use_reloader=False, verbosity=1)

if __name__ == "__main__":
    main()