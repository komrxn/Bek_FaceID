"""Signed-cookie sessions via itsdangerous.

Why not JWT: this is a single admin role on a LAN tool. JWTs add token-
rotation and revocation surface for zero practical benefit at our scale.
The signed cookie is httpOnly, SameSite=lax, and TTL-limited.

The cookie's payload is `{"sub": <username>}` — minimal, by design.
"""

from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import get_settings

COOKIE_NAME = "bek_admin_session"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(
        secret_key=get_settings().session_secret, salt="bek-admin-session"
    )


def issue(username: str) -> str:
    return _serializer().dumps({"sub": username})


def verify(token: str) -> str | None:
    """Return the username, or None if the token is missing/invalid/expired."""
    if not token:
        return None
    max_age = get_settings().admin_session_ttl_hours * 3600
    try:
        payload = _serializer().loads(token, max_age=max_age)
    except SignatureExpired:
        return None
    except BadSignature:
        return None
    if not isinstance(payload, dict):
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
