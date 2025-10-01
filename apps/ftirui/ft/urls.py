from django.urls import path
from . import views

app_name = "ft"

urlpatterns = [
    path("", views.index, name="index"),
    path("preview/", views.preview, name="preview"),
    path("plot_preview", views.plot_preview, name="plot_preview"),
    path("convert/", views.convert, name="convert"),
    path("plot", views.plot_image, name="plot"),  # returns PNG bytes
    path("notes/", views.notes, name="notes"),
    path("logs/", views.logs, name="logs"),
]