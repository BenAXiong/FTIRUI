from django.urls import path
from . import views

app_name = "ft"

urlpatterns = [
    path("", views.index, name="home"),
    path("workspace/", views.workspace_page, name="workspace"),
    path("plans/", views.plans_page, name="plans"),
    path("plans/checkout/", views.checkout_placeholder_page, name="checkout_placeholder"),
    path("plans/downgrade/", views.downgrade_subscription, name="downgrade_subscription"),
    path("profile/", views.profile, name="profile"),

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

urlpatterns += [
    path('api/dashboard/sections/', views.api_dashboard_sections, name='api_dashboard_sections'),
    path('api/dashboard/sections/<uuid:section_id>/', views.api_dashboard_section_detail, name='api_dashboard_section_detail'),
    path('api/dashboard/sections/<uuid:section_id>/projects/', views.api_dashboard_section_projects, name='api_dashboard_section_projects'),
    path('api/dashboard/projects/<uuid:project_id>/', views.api_dashboard_project_detail, name='api_dashboard_project_detail'),
    path('api/dashboard/projects/<uuid:project_id>/canvases/', views.api_dashboard_project_canvases, name='api_dashboard_project_canvases'),
    path('api/dashboard/canvases/<uuid:canvas_id>/', views.api_dashboard_canvas_detail, name='api_dashboard_canvas_detail'),
    path('api/dashboard/canvases/<uuid:canvas_id>/state/', views.api_dashboard_canvas_state, name='api_dashboard_canvas_state'),
    path('api/dashboard/canvases/<uuid:canvas_id>/thumbnail/', views.api_dashboard_canvas_thumbnail, name='api_dashboard_canvas_thumbnail'),
    path('api/dashboard/canvases/<uuid:canvas_id>/versions/', views.api_dashboard_canvas_versions, name='api_dashboard_canvas_versions'),
    path('api/dashboard/canvases/<uuid:canvas_id>/versions/<uuid:version_id>/', views.api_dashboard_canvas_version_detail, name='api_dashboard_canvas_version_detail'),
]
