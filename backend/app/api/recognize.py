"""POST /api/recognize — the kiosk's sole data channel.

M4 update: full envelope.
  - Single-thread executor runs detect+embed.
  - Debouncer needs ≥3 of last 5 frames to agree before can_mark_attendance=True.
  - Mints a pending_event_token (15 s TTL) bound to (employee_id, kiosk_id).
  - Returns last_event_today so the kiosk can hint which button is logical.

When recognition is unstable the response is still 200 with a soft status
(`unknown` / `no_face`). The kiosk uses these to drive its state machine.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, time as dtime, timedelta

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.anti_spoof import AntiSpoofEngine
from app.core.debounce import Debouncer
from app.core.executor import get_executor
from app.core.face_engine import FaceEngine
from app.core.pending_tokens import PendingTokens
from app.core.recognition_service import decode_jpeg, run_pipeline
from app.core.runtime_settings import RuntimeSettings
from app.db import crud
from app.db.models import AttendanceEvent
from app.db.schemas import (
    EmployeePublic,
    LastEventToday,
    RecognizeResponse,
    RecognizeStatus,
)
from app.deps import (
    get_anti_spoof,
    get_db,
    get_debouncer,
    get_face_engine,
    get_pending_tokens,
    get_runtime_settings,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recognize"])


async def _last_event_today(
    session: AsyncSession, employee_id: int
) -> AttendanceEvent | None:
    """Newest attendance event for an employee since local midnight (UTC approx)."""
    midnight = datetime.combine(datetime.utcnow().date(), dtime.min)
    res = await session.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.employee_id == employee_id)
        .where(AttendanceEvent.event_ts >= midnight)
        .order_by(desc(AttendanceEvent.event_ts))
        .limit(1)
    )
    return res.scalar_one_or_none()


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize(
    frame: UploadFile = File(..., description="JPEG snapshot from the kiosk camera"),
    kiosk_id: str = Form("main"),
    engine: FaceEngine = Depends(get_face_engine),
    anti_spoof: AntiSpoofEngine = Depends(get_anti_spoof),
    debouncer: Debouncer = Depends(get_debouncer),
    pending: PendingTokens = Depends(get_pending_tokens),
    runtime: RuntimeSettings = Depends(get_runtime_settings),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RecognizeResponse:
    raw = await frame.read()
    bgr = decode_jpeg(raw)
    if bgr is None:
        return RecognizeResponse(status=RecognizeStatus.no_face)

    loop = asyncio.get_running_loop()
    # Runtime overrides take precedence over env defaults for the two
    # thresholds the manager can tune from /admin/settings.
    threshold_strong = float(
        runtime.get("recognition_threshold_strong")
        or settings.recognition_threshold_strong
    )
    antispoof_threshold = float(
        runtime.get("antispoof_threshold") or settings.antispoof_threshold
    )

    result = await loop.run_in_executor(
        get_executor(),
        lambda: run_pipeline(
            engine,
            bgr,
            threshold_strong=threshold_strong,
            threshold_soft=settings.recognition_threshold_soft,
            anti_spoof=anti_spoof,
            anti_spoof_threshold=antispoof_threshold,
        ),
    )

    # Common envelope skeleton.
    response = RecognizeResponse(
        status=result.status,
        confidence=round(result.confidence, 4),
        anti_spoof_score=round(result.anti_spoof_score, 4),
    )

    if result.status is not RecognizeStatus.recognized or result.employee_id is None:
        return response

    # Load the employee from DB (PK lookup, indexed).
    emp = await crud.get_employee(session, result.employee_id)
    if emp is None or not emp.is_active:
        logger.error(
            "FAISS hit for employee_id=%s but DB row missing/inactive",
            result.employee_id,
        )
        response.status = RecognizeStatus.unknown
        response.confidence = 0.0
        return response

    photo_url = (
        f"/static/employee_photos/{emp.photo_path}" if emp.photo_path else None
    )
    response.employee = EmployeePublic(
        id=emp.id,
        full_name=emp.full_name,
        position=emp.position,
        photo_url=photo_url,
    )

    # Last-event hint for the kiosk UI (auto-pre-select "Ушёл" if they
    # already came in today).
    last = await _last_event_today(session, emp.id)
    if last:
        response.last_event_today = LastEventToday(
            event_type=last.event_type,
            event_ts=last.event_ts.isoformat(),
        )

    # Debounce — only confirm when ≥3 of the last 5 frames within 2.5s agree.
    if debouncer.register(kiosk_id, emp.id):
        token = pending.mint(
            employee_id=emp.id,
            kiosk_id=kiosk_id,
            confidence=result.confidence,
            anti_spoof_score=result.anti_spoof_score,
        )
        response.can_mark_attendance = True
        response.pending_event_token = token

    return response
