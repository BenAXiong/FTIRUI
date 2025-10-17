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
