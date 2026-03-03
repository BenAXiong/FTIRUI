from django.conf import settings

from .workspace_policy import get_workspace_limits, get_workspace_plan_state


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
    active_limits = get_workspace_limits(request)
    plan_state = get_workspace_plan_state(request)

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
        "workspace_plan": plan_state["plan"],
        "workspace_billing_status": plan_state["billing_status"],
        "media_storage_transient": bool(getattr(settings, "MEDIA_STORAGE_TRANSIENT", False)),
        "media_storage_notice": (
            "Alpha storage note: generated files and server-stored extras are temporary on this deployment. "
            "Download converted files immediately and expect thumbnails or shared notes to reset after a restart."
            if getattr(settings, "MEDIA_STORAGE_TRANSIENT", False)
            else ""
        ),
    }
