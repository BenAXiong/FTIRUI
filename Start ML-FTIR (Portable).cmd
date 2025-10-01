@echo off
setlocal

set PY=python-embed\python.exe
if not exist %PY% (
  echo Embedded Python not found at %PY%
  pause
  exit /b 1
)

REM Run directly with embedded Python (no venv needed)
cd apps\ftirui
set DJANGO_SETTINGS_MODULE=ftirui.settings_dist
..\..\python-embed\python.exe run_local.py

endlocal