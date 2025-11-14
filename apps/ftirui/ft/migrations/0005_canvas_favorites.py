from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ft", "0004_canvas_renames"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacecanvas",
            name="is_favorite",
            field=models.BooleanField(default=False),
        ),
    ]
