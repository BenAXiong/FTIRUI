from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from ft.models import WorkspaceCanvas, WorkspaceProject, WorkspaceSection
from ._workspace_migrator import _compute_state

User = get_user_model()

SECTION_NAME = "Demo Workspace"
PROJECT_NAME = "Spectra Launch"
PROJECT_SUMMARY = "Sample canvases seeded for local demos."

SAMPLE_CANVASES = [
    {
        "title": "Baseline ATR Scan",
        "version": "v1",
        "traces": {"trace-1": {"id": "trace-1", "data": {"x": [4000, 3000, 2000, 1500, 1000], "y": [0.1, 0.35, 0.24, 0.5, 0.15]}}},
        "folder_order": ["root"],
    },
    {
        "title": "Polymer Blend Review",
        "version": "draft",
        "traces": {"trace-1": {"id": "trace-1", "data": {"x": [4000, 2000, 1500, 1000], "y": [0.2, 0.25, 0.4, 0.3]}}},
        "folder_order": ["root"],
    },
]


class Command(BaseCommand):
    help = "Seed a demo section/project/canvas set for local testing."

    def add_arguments(self, parser):
        parser.add_argument("username", help="Existing user that will own the demo data.")
        parser.add_argument(
            "--replace",
            action="store_true",
            dest="replace",
            help="Remove existing demo data for this user before seeding.",
        )

    def handle(self, *args, **options):
        username = options["username"]
        replace = options.get("replace", False)

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist as exc:
            raise CommandError(f"User '{username}' does not exist.") from exc

        if replace:
            WorkspaceSection.objects.filter(owner=user, name=SECTION_NAME).delete()

        section, _ = WorkspaceSection.objects.get_or_create(
            owner=user,
            name=SECTION_NAME,
            defaults={
                "description": "Auto-generated section for demo canvases",
                "color": "",
                "position": 0,
            },
        )
        project, _ = WorkspaceProject.objects.get_or_create(
            owner=user,
            section=section,
            title=PROJECT_NAME,
            defaults={
                "summary": PROJECT_SUMMARY,
                "position": 0,
            },
        )

        WorkspaceCanvas.objects.filter(owner=user, project=project, title__in=[c["title"] for c in SAMPLE_CANVASES]).delete()

        created = 0
        for sample in SAMPLE_CANVASES:
            state = {
                "version": 2,
                "order": list(sample["traces"].keys()),
                "traces": sample["traces"],
                "folders": {
                    "root": {
                        "id": "root",
                        "name": "Root",
                        "parent": None,
                        "folders": [],
                        "traces": list(sample["traces"].keys()),
                        "collapsed": False,
                    }
                },
                "folderOrder": sample.get("folder_order", ["root"]),
                "ui": {"activeFolder": "root"},
                "global": {"sessionTitle": sample["title"]},
            }
            state, size = _compute_state(state)
            WorkspaceCanvas.objects.create(
                owner=user,
                project=project,
                title=sample["title"],
                state_json=state,
                state_size=size,
                version_label=sample.get("version") or "",
                thumbnail_url="",
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f"Seeded {created} demo canvases for '{username}' in section '{SECTION_NAME}'."))
