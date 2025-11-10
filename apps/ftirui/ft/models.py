import uuid

from django.contrib.auth import get_user_model
from django.db import models


class PlotSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        get_user_model(),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="plot_sessions",
    )
    title = models.CharField(max_length=200, blank=True, default="")
    state_json = models.JSONField()
    state_size = models.PositiveIntegerField(default=0)
    storage_backend = models.CharField(max_length=32, default="db")
    payload_locator = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["owner", "updated_at"])
        ]
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title or f"Session {self.id}"


class WorkspaceSection(models.Model):
    """Top-level containers (e.g., Daily Report, Posters)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name="workspace_sections",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    color = models.CharField(max_length=32, blank=True, default="")
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "created_at"]
        unique_together = ("owner", "name")

    def __str__(self):
        return self.name


class WorkspaceProject(models.Model):
    """Project cards that live inside sections."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name="workspace_projects",
    )
    section = models.ForeignKey(
        WorkspaceSection,
        on_delete=models.CASCADE,
        related_name="projects",
    )
    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=512, blank=True, default="")
    position = models.PositiveIntegerField(default=0)
    cover_thumbnail = models.CharField(max_length=512, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "created_at"]
        indexes = [
            models.Index(fields=["owner", "section", "position"]),
        ]

    def __str__(self):
        return self.title


class WorkspaceBoard(models.Model):
    """Editable boards/canvases that store PlotSession payloads."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name="workspace_boards",
    )
    project = models.ForeignKey(
        WorkspaceProject,
        on_delete=models.CASCADE,
        related_name="boards",
    )
    title = models.CharField(max_length=200)
    state_json = models.JSONField(default=dict)
    state_size = models.PositiveIntegerField(default=0)
    thumbnail_url = models.CharField(max_length=512, blank=True, default="")
    version_label = models.CharField(max_length=120, blank=True, default="")
    autosave_token = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["owner", "project", "updated_at"]),
        ]

    def __str__(self):
        return self.title or f"Board {self.id}"


class WorkspaceBoardVersion(models.Model):
    """Immutable snapshots of a board."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(
        WorkspaceBoard,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    created_by = models.ForeignKey(
        get_user_model(),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="workspace_board_versions",
    )
    label = models.CharField(max_length=120, blank=True, default="")
    notes = models.CharField(max_length=512, blank=True, default="")
    state_json = models.JSONField(default=dict)
    state_size = models.PositiveIntegerField(default=0)
    thumbnail_url = models.CharField(max_length=512, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["board", "created_at"]),
        ]

    def __str__(self):
        return self.label or f"Snapshot {self.id}"
