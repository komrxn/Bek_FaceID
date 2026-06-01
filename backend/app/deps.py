"""FastAPI dependency providers.

Centralizing DI here keeps handlers thin and testable. Tests override these
via `app.dependency_overrides` to inject stubs.

Grows milestone-by-milestone:
  M1 → get_face_engine
  M2 → get_db, get_photo_storage
  M3 → require_admin
  M5 → get_anti_spoof_engine
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import HTTPException, Request, status

from app.config import get_settings
from app.core.photo_storage import PhotoStorage
from app.db.database import get_db as _get_db  # re-export

if TYPE_CHECKING:  # pragma: no cover
    from app.core.anti_spoof import AntiSpoofEngine
    from app.core.debounce import Debouncer
    from app.core.face_engine import FaceEngine
    from app.core.pending_tokens import PendingTokens
    from app.core.runtime_settings import RuntimeSettings


# Re-export so handlers depend on app.deps consistently.
get_db = _get_db


def get_face_engine(request: Request) -> "FaceEngine":
    """Pull the singleton FaceEngine loaded by the lifespan."""
    engine = getattr(request.app.state, "face_engine", None)
    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face recognition engine is not initialized.",
        )
    return engine


def get_anti_spoof(request: Request) -> "AntiSpoofEngine":
    return request.app.state.anti_spoof  # type: ignore[no-any-return]


def get_debouncer(request: Request) -> "Debouncer":
    return request.app.state.debouncer  # type: ignore[no-any-return]


def get_pending_tokens(request: Request) -> "PendingTokens":
    return request.app.state.pending_tokens  # type: ignore[no-any-return]


def get_runtime_settings(request: Request) -> "RuntimeSettings":
    return request.app.state.runtime_settings  # type: ignore[no-any-return]


_photo_storage: PhotoStorage | None = None


def get_photo_storage() -> PhotoStorage:
    global _photo_storage
    if _photo_storage is None:
        _photo_storage = PhotoStorage(get_settings().employee_photos_dir)
    return _photo_storage
