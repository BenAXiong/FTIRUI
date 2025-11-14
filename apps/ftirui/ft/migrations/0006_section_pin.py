from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ft", "0005_canvas_favorites"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacesection",
            name="is_pinned",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterModelOptions(
            name="workspacesection",
            options={"ordering": ["-is_pinned", "position", "created_at"]},
        ),
    ]
