from __future__ import annotations

import logging
from pathlib import Path

from django.core.management import call_command
from django.db import OperationalError, ProgrammingError

from .models import WorkspaceBoard

SENTINEL_NAME = ".desktop_seed_complete"

log = logging.getLogger(__name__)


def _sentinel_path() -> Path:
    try:
        from django.conf import settings
    except RuntimeError:
        return Path(".") / SENTINEL_NAME
    base_dir = getattr(settings, "BASE_DIR", Path("."))
    return Path(base_dir) / SENTINEL_NAME


def ensure_workspace_seeded() -> bool:
    sentinel = _sentinel_path()
    if sentinel.exists():
        return False
    try:
        if WorkspaceBoard.objects.exists():
            sentinel.touch()
            return False
    except (OperationalError, ProgrammingError) as exc:
        log.warning("Workspace check failed before migrations: %s", exc)
        return False

    try:
        call_command("seed_workspace_from_sessions")
        sentinel.touch()
        log.info("Workspace boards seeded from legacy sessions.")
        return True
    except Exception as exc:  # pylint: disable=broad-except
        log.error("Workspace seeding failed: %s", exc, exc_info=True)
        return False
