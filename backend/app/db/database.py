"""Async SQLAlchemy engine + session factory + WAL pragma.

WAL ("write-ahead log") mode lets read queries (admin dashboard, kiosk
photo lookups) proceed concurrently with the rare write (an attendance
event every few minutes). Without WAL, SQLite serializes everything on a
single global mutex, which is fine at our load but turns into a tiny
hiccup on monthly export runs where the read transaction is long.

`get_db` is the FastAPI dependency for request-scoped sessions.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings


def _build_engine() -> AsyncEngine:
    settings = get_settings()
    engine = create_async_engine(
        settings.db_url,
        echo=False,
        future=True,
        pool_pre_ping=True,
    )

    # WAL + sensible synchronous level. Applied on every fresh connection.
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


_engine: AsyncEngine = _build_engine()
SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    _engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


def get_engine() -> AsyncEngine:
    return _engine


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
