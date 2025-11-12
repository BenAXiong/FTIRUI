from __future__ import annotations

from django.core.management.base import BaseCommand

from ._workspace_migrator import (
    DEFAULT_PROJECT_NAME,
    DEFAULT_SECTION_NAME,
    WorkspaceMigrator,
)


class Command(BaseCommand):
    help = "Migrate PlotSession rows into the workspace Projects/Folders/Canvases hierarchy."

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
            help="Only migrate the first N PlotSession rows.",
        )
        parser.add_argument(
            "--section-name",
            type=str,
            dest="section_name",
            default=DEFAULT_SECTION_NAME,
            help=f"Name of the section to create per user (default: {DEFAULT_SECTION_NAME!r}).",
        )
        parser.add_argument(
            "--project-name",
            type=str,
            dest="project_name",
            default=DEFAULT_PROJECT_NAME,
            help=f"Name of the project that will hold migrated canvases (default: {DEFAULT_PROJECT_NAME!r}).",
        )
        parser.add_argument(
            "--delete-source",
            action="store_true",
            dest="delete_source",
            help="Delete PlotSession rows after successful migration.",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        limit = options.get("limit")
        delete_source = options.get("delete_source", False)

        section_name = (options.get("section_name") or DEFAULT_SECTION_NAME).strip() or DEFAULT_SECTION_NAME
        project_name = (options.get("project_name") or DEFAULT_PROJECT_NAME).strip() or DEFAULT_PROJECT_NAME

        migrator = WorkspaceMigrator(section_name=section_name, project_name=project_name)
        stats = migrator.migrate(
            dry_run=dry_run,
            limit=limit,
            delete_source=delete_source and not dry_run,
        )

        total = stats.get("sessions_migrated", stats.get("sessions_would_migrate", 0))
        verb = "would migrate" if dry_run else "migrated"
        self.stdout.write(f"Sessions {verb}: {total}")
        if delete_source and dry_run:
            self.stdout.write("Note: --delete-source is ignored during dry runs.")
