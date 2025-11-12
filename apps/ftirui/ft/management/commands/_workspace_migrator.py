from __future__ import annotations

from collections import defaultdict
from typing import Dict, Optional

from django.utils import timezone

from ft import sessions_repository as session_repo
from ft.models import (
    PlotSession,
    WorkspaceCanvas,
    WorkspaceProject,
    WorkspaceSection,
)

DEFAULT_SECTION_NAME = "Projects"
DEFAULT_PROJECT_NAME = "Unsorted"


def _next_position(queryset):
    last = queryset.order_by("-position").first()
    if not last:
        return 1
    return max(1, (last.position or 0) + 1)


def _compute_state(state):
    if not isinstance(state, dict):
        state = {}
    size, _ = session_repo._serialise_state(state)
    return state, size


class WorkspaceMigrator:
    """
    Shared helper for commands that migrate PlotSession rows into Workspace canvases.
    """

    def __init__(self, *, section_name: str = DEFAULT_SECTION_NAME, project_name: str = DEFAULT_PROJECT_NAME):
        self.section_name = (section_name or DEFAULT_SECTION_NAME).strip()
        self.project_name = (project_name or DEFAULT_PROJECT_NAME).strip()
        self.section_cache: Dict[int, WorkspaceSection] = {}
        self.project_cache: Dict[int, WorkspaceProject] = {}

    def _ensure_section(self, owner):
        cached = self.section_cache.get(owner.id)
        if cached:
            return cached, False
        section, created = WorkspaceSection.objects.get_or_create(
            owner=owner,
            name=self.section_name,
            defaults={
                "description": "Auto-generated section for migrated sessions",
                "color": "",
                "position": _next_position(WorkspaceSection.objects.filter(owner=owner)),
            },
        )
        self.section_cache[owner.id] = section
        return section, created

    def _ensure_project(self, owner, section):
        cached = self.project_cache.get(owner.id)
        if cached:
            return cached, False
        project, created = WorkspaceProject.objects.get_or_create(
            owner=owner,
            section=section,
            title=self.project_name,
            defaults={
                "summary": "Sessions migrated from the legacy storage flow",
                "position": _next_position(section.projects.all()),
            },
        )
        self.project_cache[owner.id] = project
        return project, created

    def migrate(
        self,
        *,
        dry_run: bool = False,
        limit: Optional[int] = None,
        delete_source: bool = False,
        stdout=None,
    ):
        qs = (
            PlotSession.objects.select_related("owner")
            .exclude(owner=None)
            .order_by("owner_id", "updated_at")
        )
        if limit:
            qs = qs[: limit]

        stats = defaultdict(int)

        for session in qs:
            owner = session.owner
            if not owner:
                stats["sessions_skipped_no_owner"] += 1
                continue

            section, section_created = self._ensure_section(owner)
            if section_created:
                stats["sections_created"] += 1
            project, project_created = self._ensure_project(owner, section)
            if project_created:
                stats["projects_created"] += 1

            title = (session.title or "").strip() or "Imported session"
            if WorkspaceCanvas.objects.filter(owner=owner, project=project, title=title).exists():
                stats["canvases_skipped_existing"] += 1
                continue

            state = session.state_json or {}
            state, state_size = _compute_state(state)

            if dry_run:
                stats["sessions_would_migrate"] += 1
                continue

            canvas = WorkspaceCanvas.objects.create(
                owner=owner,
                project=project,
                title=title,
                state_json=state,
                state_size=state_size,
                version_label="imported",
                thumbnail_url="",
            )
            created_at = session.created_at or timezone.now()
            updated_at = session.updated_at or timezone.now()
            WorkspaceCanvas.objects.filter(id=canvas.id).update(created_at=created_at, updated_at=updated_at)

            if delete_source:
                session.delete()

            stats["sessions_migrated"] += 1

        if stdout:
            stdout.write(
                f"Sections created: {stats.get('sections_created', 0)}\n"
                f"Projects created: {stats.get('projects_created', 0)}\n"
                f"Sessions migrated: {stats.get('sessions_migrated', stats.get('sessions_would_migrate', 0))}"
            )

        return stats
