from __future__ import annotations

import math
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.utils import timezone

from ft import sessions_repository as session_repo
from ft.models import (
    PlotSession,
    WorkspaceSection,
    WorkspaceProject,
    WorkspaceCanvas,
)


DEFAULT_SECTION_NAME = "Projects"
DEFAULT_PROJECT_NAME = "Legacy Imports"


class Command(BaseCommand):
    help = "Populate workspace sections/projects/canvases from existing PlotSession entries."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            dest="dry_run",
            help="Report what would happen without writing to the database.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            dest="limit",
            help="Only process the first N PlotSession rows (useful for smoke tests).",
        )
        parser.add_argument(
            "--section-name",
            type=str,
            dest="section_name",
            default=DEFAULT_SECTION_NAME,
            help=f"Name of the default section to create per user (default: {DEFAULT_SECTION_NAME!r}).",
        )
        parser.add_argument(
            "--project-name",
            type=str,
            dest="project_name",
            default=DEFAULT_PROJECT_NAME,
            help=f"Name of the project that will hold imported canvases (default: {DEFAULT_PROJECT_NAME!r}).",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        limit = options.get("limit")
        section_name = (options.get("section_name") or DEFAULT_SECTION_NAME).strip() or DEFAULT_SECTION_NAME
        project_name = (options.get("project_name") or DEFAULT_PROJECT_NAME).strip() or DEFAULT_PROJECT_NAME

        sessions_qs = (
            PlotSession.objects.select_related("owner")
            .exclude(owner=None)
            .order_by("owner_id", "updated_at")
        )
        if limit:
            sessions_qs = sessions_qs[:limit]

        stats = defaultdict(int)
        section_cache = {}
        project_cache = {}

        for session in sessions_qs:
            owner = session.owner
            if not owner:
                stats["skipped_no_owner"] += 1
                continue

            section = section_cache.get(owner.id)
            if not section:
                section, created = WorkspaceSection.objects.get_or_create(
                    owner=owner,
                    name=section_name,
                    defaults={
                        "description": "Auto-generated section for imported sessions",
                        "color": "",
                        "position": _next_position(WorkspaceSection.objects.filter(owner=owner)),
                    },
                )
                section_cache[owner.id] = section
                if created:
                    stats["sections_created"] += 1

            project = project_cache.get(owner.id)
            if not project:
                project, created = WorkspaceProject.objects.get_or_create(
                    owner=owner,
                    section=section,
                    title=project_name,
                    defaults={
                        "summary": "Sessions migrated from the legacy storage flow",
                        "position": _next_position(section.projects.all()),
                    },
                )
                project_cache[owner.id] = project
                if created:
                    stats["projects_created"] += 1

            if WorkspaceCanvas.objects.filter(owner=owner, project=project, title=session.title or "").exists():
                stats["canvases_skipped_existing"] += 1
                continue

            state = session.state_json or {}
            state, size = _compute_state(state)
            title = session.title or "Imported session"

            if dry_run:
                stats["canvases_would_create"] += 1
                continue

            canvas = WorkspaceCanvas.objects.create(
                owner=owner,
                project=project,
                title=title,
                state_json=state,
                state_size=size,
                version_label="imported",
                thumbnail_url="",
            )
            canvas.created_at = session.created_at or timezone.now()
            canvas.updated_at = session.updated_at or timezone.now()
            canvas.save(update_fields=["created_at", "updated_at"])
            stats["canvases_created"] += 1

        self._render_summary(stats, dry_run)

    def _render_summary(self, stats, dry_run):
        total_canvases = stats.get("canvases_created", 0)
        if dry_run:
            total_canvases = stats.get("canvases_would_create", 0)
        summary = [
            ("Sections created", stats.get("sections_created", 0)),
            ("Projects created", stats.get("projects_created", 0)),
            ("Canvases skipped (existing)", stats.get("canvases_skipped_existing", 0)),
            ("Sessions without owner", stats.get("skipped_no_owner", 0)),
        ]
        for label, value in summary:
            self.stdout.write(f"{label}: {value}")

        verb = "would create" if dry_run else "created"
        self.stdout.write(f"Canvases {verb}: {total_canvases}")


def _compute_state(state):
    if not isinstance(state, dict):
        state = {}
    size, _ = session_repo._serialise_state(state)
    return state, size


def _next_position(queryset):
    last = queryset.order_by("-position").first()
    if not last:
        return 1
    return max(1, last.position + 1)
