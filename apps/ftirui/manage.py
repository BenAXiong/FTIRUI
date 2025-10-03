import os, sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent          # ...\apps\ftirui
APPS_DIR = BASE_DIR.parent                           # ...\apps
REPO_ROOT = APPS_DIR.parent                          # ...\mlirui  <-- contains "core"
repo_str = str(REPO_ROOT)
if repo_str not in sys.path:
    sys.path.insert(0, repo_str)

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ftirui.settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()