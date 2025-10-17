from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ft", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="plotsession",
            name="payload_locator",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="plotsession",
            name="state_size",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="plotsession",
            name="storage_backend",
            field=models.CharField(default="db", max_length=32),
        ),
    ]
