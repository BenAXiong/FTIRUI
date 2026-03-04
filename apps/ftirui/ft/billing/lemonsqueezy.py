from __future__ import annotations

import hashlib
import hmac
from datetime import timezone as dt_timezone
from dataclasses import dataclass
from typing import Any

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from ..models import WorkspaceSubscription


class LemonSqueezyError(Exception):
    """Raised when Lemon Squeezy billing cannot proceed safely."""


@dataclass(frozen=True)
class CheckoutRequest:
    user_id: str
    email: str
    name: str
    plan: str
    interval: str
    source: str


def billing_enabled() -> bool:
    return bool(getattr(settings, "LEMONSQUEEZY_ENABLED", False))


def get_variant_id(plan: str, interval: str) -> int:
    normalized_plan = (plan or "").strip().lower()
    normalized_interval = (interval or "").strip().lower()
    if normalized_plan != WorkspaceSubscription.PLAN_PRO:
        raise LemonSqueezyError(f"Unsupported plan for Lemon Squeezy checkout: {normalized_plan or '<empty>'}")
    if normalized_interval == "monthly":
        variant_id = getattr(settings, "LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID", None)
    elif normalized_interval == "yearly":
        variant_id = getattr(settings, "LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID", None)
    else:
        raise LemonSqueezyError(f"Unsupported billing interval: {normalized_interval or '<empty>'}")
    if not variant_id:
        raise LemonSqueezyError(f"Missing Lemon Squeezy variant id for {normalized_plan}/{normalized_interval}.")
    return int(variant_id)


def _api_headers() -> dict[str, str]:
    api_key = getattr(settings, "LEMONSQUEEZY_API_KEY", "")
    if not api_key:
        raise LemonSqueezyError("LEMONSQUEEZY_API_KEY is not configured.")
    return {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": f"Bearer {api_key}",
    }


def create_checkout(request: CheckoutRequest) -> str:
    if not billing_enabled():
        raise LemonSqueezyError("Lemon Squeezy billing is disabled.")

    store_id = getattr(settings, "LEMONSQUEEZY_STORE_ID", None)
    if not store_id:
        raise LemonSqueezyError("LEMONSQUEEZY_STORE_ID is not configured.")

    variant_id = get_variant_id(request.plan, request.interval)
    payload: dict[str, Any] = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "product_options": {
                    "redirect_url": getattr(settings, "LEMONSQUEEZY_CHECKOUT_SUCCESS_URL", ""),
                    "enabled_variants": [variant_id],
                },
                "checkout_options": {
                    "embed": False,
                },
                "checkout_data": {
                    "email": request.email or "",
                    "name": request.name or "",
                    "custom": {
                        "user_id": request.user_id,
                        "plan": request.plan,
                        "interval": request.interval,
                        "source": request.source,
                    },
                },
            },
            "relationships": {
                "store": {
                    "data": {
                        "type": "stores",
                        "id": str(store_id),
                    }
                },
                "variant": {
                    "data": {
                        "type": "variants",
                        "id": str(variant_id),
                    }
                },
            },
        }
    }

    response = requests.post(
        f"{settings.LEMONSQUEEZY_API_BASE.rstrip('/')}/checkouts",
        headers=_api_headers(),
        json=payload,
        timeout=15,
    )
    response.raise_for_status()
    data = response.json().get("data", {})
    checkout_url = (((data.get("attributes") or {}).get("url")) or "").strip()
    if not checkout_url:
        raise LemonSqueezyError("Lemon Squeezy checkout response did not include a checkout URL.")
    return checkout_url


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    secret = getattr(settings, "LEMONSQUEEZY_WEBHOOK_SECRET", "")
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def _parse_dt(value: str | None):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, dt_timezone.utc)
    return parsed


def _billing_status_from_provider_status(provider_status: str, *, ends_at=None) -> str:
    normalized = (provider_status or "").strip().lower()
    if normalized in {"active", "on_trial", "paused", "past_due", "unpaid"}:
        return WorkspaceSubscription.STATUS_ACTIVE
    if normalized == "cancelled":
        if ends_at is None or ends_at > timezone.now():
            return WorkspaceSubscription.STATUS_ACTIVE
        return WorkspaceSubscription.STATUS_INACTIVE
    return WorkspaceSubscription.STATUS_INACTIVE


def _plan_from_variant(variant_id: str) -> str:
    known_pro_variants = {
        str(getattr(settings, "LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID", "")),
        str(getattr(settings, "LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID", "")),
    }
    if variant_id and variant_id in known_pro_variants:
        return WorkspaceSubscription.PLAN_PRO
    return WorkspaceSubscription.PLAN_FREE


def get_customer_portal_url() -> str:
    domain = (getattr(settings, "LEMONSQUEEZY_STORE_DOMAIN", "") or "").strip()
    if not domain:
        raise LemonSqueezyError("LEMONSQUEEZY_STORE_DOMAIN is not configured.")
    return f"https://{domain}/billing"


def sync_webhook_event(payload: dict[str, Any], *, owner_resolver) -> WorkspaceSubscription | None:
    meta = payload.get("meta") or {}
    event_name = (meta.get("event_name") or "").strip()
    custom_data = meta.get("custom_data") or {}
    data = payload.get("data") or {}
    attributes = data.get("attributes") or {}

    provider_subscription_id = str(data.get("id") or "") if data.get("type") == "subscriptions" else ""
    provider_variant_id = str(
        attributes.get("variant_id")
        or ((attributes.get("first_subscription_item") or {}).get("variant_id"))
        or ""
    )
    provider_product_id = str(
        attributes.get("product_id")
        or ((attributes.get("first_subscription_item") or {}).get("product_id"))
        or ""
    )
    provider_order_id = str(attributes.get("order_id") or data.get("id") or "") if data.get("type") == "orders" else str(attributes.get("order_id") or "")
    provider_customer_id = str(attributes.get("customer_id") or "")
    provider_status = (attributes.get("status") or "").strip().lower()
    provider_test_mode = bool(attributes.get("test_mode"))
    ends_at = _parse_dt(attributes.get("ends_at"))
    subscription_owner = None

    if provider_subscription_id:
        subscription = WorkspaceSubscription.objects.filter(provider_subscription_id=provider_subscription_id).first()
        if subscription:
            subscription_owner = subscription.owner
    if subscription_owner is None:
        user_id = custom_data.get("user_id")
        if user_id is not None:
            subscription_owner = owner_resolver(user_id)
    if subscription_owner is None:
        return None

    subscription, _ = WorkspaceSubscription.objects.get_or_create(owner=subscription_owner)
    if provider_subscription_id:
        subscription.provider_subscription_id = provider_subscription_id
    if provider_customer_id:
        subscription.provider_customer_id = provider_customer_id
    if provider_order_id:
        subscription.provider_order_id = provider_order_id
    if provider_product_id:
        subscription.provider_product_id = provider_product_id
    if provider_variant_id:
        subscription.provider_variant_id = provider_variant_id
    if provider_status:
        subscription.provider_status = provider_status
    subscription.provider_test_mode = provider_test_mode
    subscription.current_period_ends_at = _parse_dt(attributes.get("renews_at"))
    subscription.cancelled_at = _parse_dt(attributes.get("cancelled_at"))
    subscription.ends_at = ends_at
    subscription.last_event_name = event_name
    subscription.last_event_at = timezone.now()
    subscription.billing_provider = "lemonsqueezy"

    derived_plan = _plan_from_variant(subscription.provider_variant_id)
    derived_billing_status = _billing_status_from_provider_status(subscription.provider_status, ends_at=subscription.ends_at)
    if event_name == "order_created" and not subscription.provider_status:
        derived_plan = subscription.plan or derived_plan
        derived_billing_status = subscription.billing_status or WorkspaceSubscription.STATUS_INACTIVE

    subscription.plan = derived_plan if derived_billing_status == WorkspaceSubscription.STATUS_ACTIVE else WorkspaceSubscription.PLAN_FREE
    subscription.billing_status = derived_billing_status
    if subscription.billing_status == WorkspaceSubscription.STATUS_ACTIVE and subscription.activated_at is None:
        subscription.activated_at = timezone.now()
    if subscription.billing_status != WorkspaceSubscription.STATUS_ACTIVE and event_name == "subscription_expired":
        subscription.activated_at = None

    subscription.save()
    return subscription
