from __future__ import annotations

from django.conf import settings
from django.utils import timezone

from .models import WorkspaceCanvas, WorkspaceProject, WorkspaceSection, WorkspaceSubscription

GUEST_WORKSPACE_OWNER_PREFIX = "guest-workspace-"

GUEST_WORKSPACE_LIMITS = {
    "sections": 1,
    "projects": 1,
    "canvases": 1,
}

AUTH_WORKSPACE_LIMITS = {
    "sections": 1,
    "projects": 1,
    "canvases": 3,
}

UNLIMITED_PLANS = {
    WorkspaceSubscription.PLAN_PRO,
    WorkspaceSubscription.PLAN_TEAM,
}


def is_guest_workspace_owner(user) -> bool:
    if not user:
        return False
    username = getattr(user, "get_username", lambda: getattr(user, "username", ""))() or ""
    return username.startswith(GUEST_WORKSPACE_OWNER_PREFIX)


def identity_is_authenticated(identity) -> bool:
    if identity is None:
        return False
    if hasattr(identity, "user"):
        user = getattr(identity, "user", None)
        return bool(getattr(user, "is_authenticated", False))
    if is_guest_workspace_owner(identity):
        return False
    return bool(getattr(identity, "is_authenticated", False))


def resolve_subscription_owner(identity):
    if identity is None:
        return None
    if hasattr(identity, "user"):
        user = getattr(identity, "user", None)
        if not getattr(user, "is_authenticated", False):
            return None
        return user
    if is_guest_workspace_owner(identity):
        return None
    if getattr(identity, "is_authenticated", False):
        return identity
    return None


def get_workspace_subscription(identity):
    owner = resolve_subscription_owner(identity)
    if not owner:
        return None
    try:
        return owner.workspace_subscription
    except WorkspaceSubscription.DoesNotExist:
        return None


def get_workspace_plan_state(identity) -> dict[str, object]:
    subscription = get_workspace_subscription(identity)
    plan = WorkspaceSubscription.PLAN_FREE
    billing_status = WorkspaceSubscription.STATUS_INACTIVE
    unlimited = False
    if subscription and subscription.billing_status == WorkspaceSubscription.STATUS_ACTIVE:
        plan = subscription.plan or WorkspaceSubscription.PLAN_FREE
        billing_status = subscription.billing_status
        unlimited = plan in UNLIMITED_PLANS
    return {
        "plan": plan,
        "billing_status": billing_status,
        "subscription": subscription,
        "is_unlimited": unlimited,
    }


def get_workspace_limits(identity):
    if not identity_is_authenticated(identity):
        return dict(GUEST_WORKSPACE_LIMITS)
    plan_state = get_workspace_plan_state(identity)
    if plan_state["is_unlimited"]:
        return {
            "sections": None,
            "projects": None,
            "canvases": None,
        }
    return {
        "sections": getattr(settings, "FT_WORKSPACE_FREE_SECTION_LIMIT", AUTH_WORKSPACE_LIMITS["sections"]),
        "projects": getattr(settings, "FT_WORKSPACE_FREE_PROJECT_LIMIT", AUTH_WORKSPACE_LIMITS["projects"]),
        "canvases": getattr(settings, "FT_WORKSPACE_FREE_CANVAS_LIMIT", AUTH_WORKSPACE_LIMITS["canvases"]),
    }


def get_workspace_usage(owner):
    return {
        "sections": WorkspaceSection.objects.filter(owner=owner).count(),
        "projects": WorkspaceProject.objects.filter(owner=owner).count(),
        "canvases": WorkspaceCanvas.objects.filter(owner=owner).count(),
    }


def activate_test_subscription(owner, plan: str):
    if plan not in UNLIMITED_PLANS:
        plan = WorkspaceSubscription.PLAN_PRO
    subscription, _ = WorkspaceSubscription.objects.get_or_create(owner=owner)
    subscription.plan = plan
    subscription.billing_status = WorkspaceSubscription.STATUS_ACTIVE
    subscription.billing_provider = "test_checkout"
    subscription.activated_at = timezone.now()
    subscription.save(update_fields=["plan", "billing_status", "billing_provider", "activated_at", "updated_at"])
    return subscription
