"""FastAPI application factory.

Lifespan loads the InsightFace model ONCE on startup, then rebuilds the
FAISS index from `face_embeddings`. Handlers reach the engine via
`Depends(get_face_engine)` and the DB via `Depends(get_db)`.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import attendance, auth, employees, export, recognize, settings_api
from app.config import get_settings
from app.core.anti_spoof import AntiSpoofEngine
from app.core.debounce import Debouncer
from app.core.face_engine import FaceEngine
from app.core.pending_tokens import PendingTokens
from app.core.runtime_settings import RuntimeSettings
from app.db import crud
from app.db.database import SessionLocal

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(
        "Starting BEK_FaceID backend (providers=%s, db=%s)",
        settings.execution_providers_list,
        settings.db_url,
    )

    # Ensure runtime dirs exist.
    settings.employee_photos_dir.mkdir(parents=True, exist_ok=True)
    settings.attendance_snapshots_dir.mkdir(parents=True, exist_ok=True)

    # Heavy: ~3–8 s on Apple Silicon to init buffalo_l. ~1 s on NVIDIA after warmup.
    engine = FaceEngine(providers=settings.execution_providers_list)

    # Rebuild FAISS from the DB (only active employees).
    async with SessionLocal() as session:
        rows = await crud.iter_active_embeddings(session)
    engine.rebuild_from_rows(list(rows))

    app.state.face_engine = engine
    app.state.anti_spoof = AntiSpoofEngine(
        models_dir=settings.models_dir / "silent_face",
        providers=settings.execution_providers_list,
    )
    app.state.debouncer = Debouncer(
        capacity=settings.debounce_of,
        window_ms=settings.debounce_window_ms,
        required=settings.debounce_required,
    )
    app.state.pending_tokens = PendingTokens(ttl_s=settings.pending_token_ttl_s)

    # Runtime settings — overlay over env defaults, mutable via /api/settings.
    app.state.runtime_settings = RuntimeSettings(
        path=settings.data_dir / "runtime_settings.json",
        defaults={
            "recognition_threshold_strong": settings.recognition_threshold_strong,
            "antispoof_threshold": settings.antispoof_threshold,
            "snapshot_retention_days": settings.snapshot_retention_days,
            "kiosk_sound_enabled": True,
        },
    )
    yield
    logger.info("Shutting down BEK_FaceID backend.")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="BEK_FaceID",
        description="Face ID employee attendance system for restaurant БЕК.",
        version="0.2.0",
        lifespan=lifespan,
    )

    # CORS allow-list:
    #   - localhost:5173 — Vite dev server during local frontend work
    #   - https://localhost — Capacitor Android WebView origin (V1.2 kiosk APK).
    #     Capacitor 5+ defaults to https://localhost when androidScheme=https.
    #   - capacitor://localhost — older Capacitor releases / iOS WebView, kept
    #     so the same backend serves a future iOS build with no change.
    # The production browser SPA at bek-faceid.ascenderframework.dev is same-origin
    # (nginx + backend share the host) so it doesn't need an entry here.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://localhost",
            "capacitor://localhost",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Employee photos — the only place the frontend reads them.
    app.mount(
        "/static/employee_photos",
        StaticFiles(directory=settings.employee_photos_dir, check_dir=False),
        name="static-employee-photos",
    )

    app.include_router(recognize.router)
    app.include_router(employees.router)
    app.include_router(auth.router)
    app.include_router(attendance.router)
    app.include_router(export.router)
    app.include_router(settings_api.router)
    app.include_router(settings_api.password_router)

    @app.get("/api/healthz", tags=["meta"])
    async def healthz() -> dict[str, object]:
        engine = getattr(app.state, "face_engine", None)
        return {
            "status": "ok",
            "index_ntotal": engine.size if engine else 0,
        }

    return app


app = create_app()
