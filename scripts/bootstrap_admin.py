#!/usr/bin/env python3
"""Seed (or update) the single admin user.

Usage (host or container):
  python scripts/bootstrap_admin.py <username> <password>

If the username already exists, its password hash is replaced — convenient
for password resets on a single-tenant LAN tool.

This script auto-detects whether it runs inside the docker image (where
the backend code lives at `/app`) or outside (where it lives at
`<repo>/backend`).
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Make `app` importable wherever this script is run.
for candidate in (
    Path("/app"),                                    # inside container
    Path(__file__).resolve().parents[1] / "backend", # repo root layout
):
    if (candidate / "app").is_dir():
        sys.path.insert(0, str(candidate))
        break

from app.db.database import SessionLocal  # noqa: E402
from app.db import crud  # noqa: E402
from app.security.passwords import hash_password  # noqa: E402


async def main(username: str, password: str) -> None:
    async with SessionLocal() as session:
        existing = await crud.get_admin_by_username(session, username)
        ph = hash_password(password)
        if existing is None:
            await crud.create_admin(session, username, ph)
            await session.commit()
            print(f"[bootstrap_admin] created admin user '{username}'")
        else:
            existing.password_hash = ph
            await session.commit()
            print(f"[bootstrap_admin] reset password for admin user '{username}'")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: bootstrap_admin.py <username> <password>", file=sys.stderr)
        sys.exit(2)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
