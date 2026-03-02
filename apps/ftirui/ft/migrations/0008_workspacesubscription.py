from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("ft", "0007_add_canvas_tags"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkspaceSubscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("plan", models.CharField(choices=[("free", "Free"), ("pro", "Pro"), ("team", "Team")], default="free", max_length=16)),
                ("billing_status", models.CharField(choices=[("inactive", "Inactive"), ("active", "Active")], default="inactive", max_length=16)),
                ("billing_provider", models.CharField(blank=True, default="", max_length=32)),
                ("activated_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="workspace_subscription", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "indexes": [models.Index(fields=["plan", "billing_status"], name="ft_workspac_plan_c33253_idx")],
            },
        ),
    ]
