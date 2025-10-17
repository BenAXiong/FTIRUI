from __future__ import annotations

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from ...models import PlotSession


class Command(BaseCommand):
    help = (
        "Inspect legacy JSON sessions stored on disk and prepare migration into the "
        "PlotSession database table. The command currently runs in dry-run mode only."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Process at most N session files (default: all).",
        )
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Attempt to persist sessions to the database (not yet supported).",
        )

    def handle(self, *args, **options):
        limit = options.get("limit")
        commit = options.get("commit", False)

        sessions_dir = Path(settings.MEDIA_ROOT) / "sessions"
        if not sessions_dir.exists():
            self.stdout.write(
                self.style.WARNING(f"No sessions directory found at {sessions_dir}")
            )
            return

        files = sorted(p for p in sessions_dir.glob("*.json") if p.is_file())
        if limit is not None:
            files = files[: max(0, limit)]

        if not files:
            self.stdout.write(self.style.WARNING("No legacy session files detected."))
            return

        self.stdout.write(f"Found {len(files)} legacy session file(s) in {sessions_dir}")

        imported = 0
        skipped = 0

        for path in files:
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except Exception as exc:
                skipped += 1
                self.stderr.write(self.style.ERROR(f"[SKIP] {path.name}: {exc}"))
                continue

            session_id = payload.get("session_id") or path.stem
            title = payload.get("title", "")
            updated = payload.get("updated")
            size = path.stat().st_size

            self.stdout.write(
                f"- {path.name} --> id={session_id} title={title!r} updated={updated!r} size={size} bytes"
            )

            if commit:
                raise CommandError(
                    "Filesystem -> database import is not implemented yet. "
                    "Please leave --commit off for now."
                )

            imported += 1

        existing = PlotSession.objects.count()
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Dry-run complete: {imported} file(s) parsed successfully, {skipped} skipped."
            )
        )
        self.stdout.write(
            f"PlotSession currently has {existing} row(s); run the future --commit workflow once implemented."
        )
