"""GET/PATCH /api/settings — runtime-tunable knobs the manager controls
from the admin UI. Applies immediately (next /api/recognize uses them);
persisted in `data/runtime_settings.json`.

Also: POST /api/auth/change-password.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin
from app.core.runtime_settings import RuntimeSettings
from app.db import crud
from app.deps import get_db, get_runtime_settings
from app.security.passwords import hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])
password_router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------- settings ----------------------------


class SettingsResponse(BaseModel):
    recognition_threshold_strong: float
    antispoof_threshold: float
    snapshot_retention_days: int
    kiosk_sound_enabled: bool


class SettingsPatch(BaseModel):
    recognition_threshold_strong: float | None = Field(None, ge=0.50, le=0.95)
    antispoof_threshold: float | None = Field(None, ge=0.50, le=0.99)
    snapshot_retention_days: int | None = Field(None, ge=7, le=365)
    kiosk_sound_enabled: bool | None = None


@router.get(
    "",
    response_model=SettingsResponse,
    dependencies=[Depends(require_admin)],
)
async def get_endpoint(
    runtime: RuntimeSettings = Depends(get_runtime_settings),
) -> SettingsResponse:
    return SettingsResponse(**runtime.snapshot())


@router.patch(
    "",
    response_model=SettingsResponse,
    dependencies=[Depends(require_admin)],
)
async def patch_endpoint(
    payload: SettingsPatch,
    runtime: RuntimeSettings = Depends(get_runtime_settings),
) -> SettingsResponse:
    new_state = runtime.update(payload.model_dump(exclude_unset=True))
    logger.info(
        "[settings] updated %s",
        payload.model_dump(exclude_unset=True),
    )
    return SettingsResponse(**new_state)


# ---------------------------- change password ----------------------------


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


@password_router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> Response:
    username = require_admin(request)
    admin = await crud.get_admin_by_username(session, username)
    if admin is None or not verify_password(payload.current_password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Текущий пароль введён неверно.",
        )
    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Новый пароль не должен совпадать со старым.",
        )
    admin.password_hash = hash_password(payload.new_password)
    await session.commit()
    logger.info("[auth] password changed for username=%s", username)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
