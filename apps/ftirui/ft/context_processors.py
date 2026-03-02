from django.conf import settings


def feature_flags(request):
    """
    Inject shared feature-flag metadata into templates.
    """

    dev_override = request.GET.get("dev") == "true"
    canvas_context = bool(request.GET.get("canvas"))

    workspace_enabled = True
    dashboard_enabled = getattr(settings, "DASHBOARD_V2_ENABLED", True) or dev_override
    forced_workspace = request.GET.get("pane") == "workspace"
    force_workspace_active = canvas_context or forced_workspace

    shortcut_enabled = getattr(settings, "WORKSPACE_DEV_SHORTCUT_ENABLED", True)
    dev_mode_active = dev_override
    auth_workspace_limits = {
        "sections": getattr(settings, "FT_WORKSPACE_FREE_SECTION_LIMIT", 1),
        "projects": getattr(settings, "FT_WORKSPACE_FREE_PROJECT_LIMIT", 1),
        "canvases": getattr(settings, "FT_WORKSPACE_FREE_CANVAS_LIMIT", 3),
    }
    guest_workspace_limits = {
        "sections": 1,
        "projects": 1,
        "canvases": 1,
    }
    active_limits = auth_workspace_limits if request.user.is_authenticated else guest_workspace_limits

    return {
        "workspace_tab_enabled": workspace_enabled,
        "workspace_pane_active": force_workspace_active,
        "initial_shell_pane": "workspace" if force_workspace_active else "dashboard",
        "workspace_dev_shortcut_enabled": bool(shortcut_enabled),
        "workspace_dev_active": dev_mode_active,
        "dashboard_v2_enabled": dashboard_enabled,
        "workspace_section_limit": active_limits["sections"],
        "workspace_project_limit": active_limits["projects"],
        "workspace_canvas_limit": active_limits["canvases"],
    }
