from __future__ import annotations

import json
import logging
from typing import Iterable

from django.db import transaction
from django.utils import timezone

from .models import PlotSession

logger = logging.getLogger(__name__)

# Placeholder threshold; sessions larger than this should be moved to an
# external object store in a future iteration.
MAX_EMBEDDED_BYTES = 2_000_000


class SessionStorageError(ValueError):
    """Raised when the session payload cannot be serialised or stored."""


class SessionTooLargeError(SessionStorageError):
    """Raised when a payload exceeds the current inline storage capacity."""


def _serialise_state(state: dict) -> tuple[int, int]:
    """
    Return the byte size of the provided state.
    The second value mirrors the size for convenience.
    """
    try:
        encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise SessionStorageError(f"Unable to serialise session payload: {exc}") from exc
    size = len(encoded)
    return size, size


def _prepare_storage(state: dict) -> tuple[int, str, str]:
    """
    Determine where to store the payload. Currently everything stays in the DB,
    but we record metadata so a future offloading step can be plugged in.
    """
    size, _ = _serialise_state(state)
    backend = "db"
    locator = ""
    if size > MAX_EMBEDDED_BYTES:
        raise SessionTooLargeError(
            f"Session payload is {size} bytes which exceeds the temporary {MAX_EMBEDDED_BYTES} byte limit."
        )
    return size, backend, locator


def create_session(owner, title: str, state: dict) -> PlotSession:
    size, backend, locator = _prepare_storage(state)
    with transaction.atomic():
        session = PlotSession.objects.create(
            owner=owner,
            title=title,
            state_json=state,
            state_size=size,
            storage_backend=backend,
            payload_locator=locator,
        )
    return session


def list_sessions(owner) -> Iterable[dict]:
    return (
        PlotSession.objects.filter(owner=owner)
        .order_by("-updated_at")
        .values("id", "title", "updated_at", "state_size", "storage_backend")
    )


def get_session(owner, session_id: str) -> PlotSession:
    return PlotSession.objects.get(id=session_id, owner=owner)


def update_session(owner, session_id: str, title: str, state: dict) -> PlotSession:
    size, backend, locator = _prepare_storage(state)
    with transaction.atomic():
        session = PlotSession.objects.select_for_update().get(id=session_id, owner=owner)
        session.title = title
        session.state_json = state
        session.state_size = size
        session.storage_backend = backend
        session.payload_locator = locator
        session.updated_at = timezone.now()
        session.save(update_fields=["title", "state_json", "state_size", "storage_backend", "payload_locator", "updated_at"])
    return session


def delete_session(owner, session_id: str) -> None:
    with transaction.atomic():
        session = PlotSession.objects.get(id=session_id, owner=owner)
        session.delete()
