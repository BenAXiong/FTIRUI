import uuid

from django.contrib.auth import get_user_model
from django.db import models

from .tagging import generate_placeholder_tags


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
    is_pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_pinned", "position", "created_at"]
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


class WorkspaceCanvas(models.Model):
    """Editable canvases that store PlotSession payloads."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name="workspace_canvases",
    )
    project = models.ForeignKey(
        WorkspaceProject,
        on_delete=models.CASCADE,
        related_name="canvases",
    )
    title = models.CharField(max_length=200)
    state_json = models.JSONField(default=dict)
    state_size = models.PositiveIntegerField(default=0)
    thumbnail_url = models.CharField(max_length=512, blank=True, default="")
    version_label = models.CharField(max_length=120, blank=True, default="")
    autosave_token = models.CharField(max_length=64, blank=True, default="")
    is_favorite = models.BooleanField(default=False)
    tags = models.JSONField(default=generate_placeholder_tags, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["owner", "project", "updated_at"]),
        ]

    def __str__(self):
        return self.title or f"Canvas {self.id}"


class WorkspaceCanvasVersion(models.Model):
    """Immutable snapshots of a canvas."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    canvas = models.ForeignKey(
        WorkspaceCanvas,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    created_by = models.ForeignKey(
        get_user_model(),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="workspace_canvas_versions",
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
            models.Index(fields=["canvas", "created_at"]),
        ]

    def __str__(self):
        return self.label or f"Snapshot {self.id}"


class WorkspaceSubscription(models.Model):
    PLAN_FREE = "free"
    PLAN_PRO = "pro"
    PLAN_TEAM = "team"
    PLAN_CHOICES = [
        (PLAN_FREE, "Free"),
        (PLAN_PRO, "Pro"),
        (PLAN_TEAM, "Team"),
    ]

    STATUS_INACTIVE = "inactive"
    STATUS_ACTIVE = "active"
    STATUS_CHOICES = [
        (STATUS_INACTIVE, "Inactive"),
        (STATUS_ACTIVE, "Active"),
    ]

    owner = models.OneToOneField(
        get_user_model(),
        on_delete=models.CASCADE,
        related_name="workspace_subscription",
    )
    plan = models.CharField(max_length=16, choices=PLAN_CHOICES, default=PLAN_FREE)
    billing_status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_INACTIVE)
    billing_provider = models.CharField(max_length=32, blank=True, default="")
    provider_customer_id = models.CharField(max_length=64, blank=True, default="")
    provider_subscription_id = models.CharField(max_length=64, blank=True, default="")
    provider_order_id = models.CharField(max_length=64, blank=True, default="")
    provider_product_id = models.CharField(max_length=64, blank=True, default="")
    provider_variant_id = models.CharField(max_length=64, blank=True, default="")
    provider_status = models.CharField(max_length=32, blank=True, default="")
    provider_test_mode = models.BooleanField(default=False)
    current_period_ends_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    last_event_name = models.CharField(max_length=64, blank=True, default="")
    last_event_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["plan", "billing_status"]),
            models.Index(fields=["provider_subscription_id"]),
        ]

    def __str__(self):
        return f"{self.owner} · {self.plan} ({self.billing_status})"
