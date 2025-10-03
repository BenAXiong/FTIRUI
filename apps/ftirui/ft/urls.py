from django.urls import path
from . import views

app_name = "ft"

# urlpatterns = [
#     path("", views.index, name="index"),
#     path("preview/", views.preview, name="preview"),
#     path("plot_preview", views.plot_preview, name="plot_preview"),
#     path("convert/", views.convert, name="convert"),
#     path("plot", views.plot_image, name="plot"),  # returns PNG bytes
#     path("notes/", views.notes, name="notes"),
#     path("logs/", views.logs, name="logs"),
# ]

urlpatterns = [
    path("", views.index, name="home"),

    # NEW JSON endpoints for Plotly + table preview
    path("data/", views.data_json, name="data_json"),
    path("preview/", views.preview_json, name="preview_json"),

    # Optional server-side PNG export for images
    path("export/png/", views.export_png, name="export_png"),

    # Other utilities
    path("notes/", views.notes, name="notes"),
    path("logs/", views.logs, name="logs"),
]