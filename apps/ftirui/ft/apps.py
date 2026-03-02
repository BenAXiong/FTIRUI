from django.apps import AppConfig


class FtConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ft'

    def ready(self):
        from . import signals  # noqa: F401
