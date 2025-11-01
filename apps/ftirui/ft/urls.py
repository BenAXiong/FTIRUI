from django.urls import path
from . import views

app_name = "ft"

urlpatterns = [
    path("", views.index, name="home"),

    # JSON endpoints for Plotly + table preview
    path("data/", views.data_json, name="data_json"),
    path("preview/", views.preview_json, name="preview_json"),

    path("api/xy/", views.api_xy, name="api_xy"),

    # Server-side PNG export for images
    path("export/png/", views.export_png, name="export_png"),

    # Other utilities
    path("notes/", views.notes, name="notes"),
    path("logs/", views.logs, name="logs"),
]

urlpatterns += [
    path('api/session/', views.api_session_create, name='api_session_create'),               # POST
    path('api/session/<uuid:session_id>/', views.api_session_get, name='api_session_get'),   # GET, PUT, DELETE
    path('api/session/list/', views.api_session_list, name='api_session_list'),              # GET
    path('api/me/', views.api_me, name='api_me'),                                            # GET
]

urlpatterns += [
    path('api/demos/', views.api_demo_files, name='api_demo_files'),
]
