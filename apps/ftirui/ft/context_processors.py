from django.conf import settings


def feature_flags(request):
    """
    Inject shared feature-flag metadata into templates.
    """

    dev_override = request.GET.get("dev") == "true"
    canvas_context = bool(request.GET.get("canvas"))

    workspace_enabled = getattr(settings, "WORKSPACE_LEGACY_ENABLED", False) or dev_override
    dashboard_enabled = getattr(settings, "DASHBOARD_V2_ENABLED", True) or dev_override
    forced_workspace = request.GET.get("pane") == "workspace"
    force_workspace_active = workspace_enabled and (canvas_context or forced_workspace)

    shortcut_enabled = getattr(settings, "WORKSPACE_DEV_SHORTCUT_ENABLED", True)
    dev_mode_active = dev_override

    return {
        "workspace_tab_enabled": workspace_enabled,
        "workspace_pane_active": force_workspace_active,
        "workspace_dev_shortcut_enabled": bool(shortcut_enabled),
        "workspace_dev_active": dev_mode_active,
        "dashboard_v2_enabled": dashboard_enabled,
    }
