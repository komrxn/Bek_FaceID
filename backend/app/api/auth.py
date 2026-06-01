"""Admin auth endpoints.

  POST /api/auth/login   — sets bek_admin_session cookie
  POST /api/auth/logout  — clears the cookie
  GET  /api/auth/me      — returns {username} or 401

The cookie is httpOnly + SameSite=lax. In docker-compose prod the frontend
and backend share an origin so this works without CORS surgery.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import crud
from app.deps import get_db
from app.security.passwords import verify_password
from app.security.session import COOKIE_NAME, issue, verify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class MeResponse(BaseModel):
    username: str


def _cookie_max_age() -> int:
    return get_settings().admin_session_ttl_hours * 3600


@router.post("/login", response_model=MeResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> MeResponse:
    admin = await crud.get_admin_by_username(session, payload.username.strip())
    if admin is None or not verify_password(payload.password, admin.password_hash):
        # Generic message — never disclose which field was wrong.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверные данные."
        )

    token = issue(admin.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=_cookie_max_age(),
        httponly=True,
        secure=False,  # LAN-only; flip to True when behind HTTPS
        samesite="lax",
        path="/",
    )
    logger.info("[auth] login username=%s", admin.username)
    return MeResponse(username=admin.username)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def logout(response: Response) -> Response:
    response.delete_cookie(COOKIE_NAME, path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=MeResponse)
async def me(request: Request) -> MeResponse:
    token = request.cookies.get(COOKIE_NAME, "")
    username = verify(token)
    if username is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Не авторизованы.")
    return MeResponse(username=username)


# ---------------------------- dependency ----------------------------


def require_admin(request: Request) -> str:
    """Use as a FastAPI dependency on admin-only routes (M3+ employees, etc.)."""
    token = request.cookies.get(COOKIE_NAME, "")
    username = verify(token)
    if username is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Не авторизованы.")
    return username
