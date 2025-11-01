from django.contrib import admin

from .models import PlotSession


@admin.register(PlotSession)
class PlotSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'owner', 'title', 'storage_backend', 'state_size', 'updated_at')
    list_filter = ('owner', 'storage_backend')
    search_fields = ('id', 'title')
