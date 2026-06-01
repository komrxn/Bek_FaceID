"""Orchestrator for per-frame recognition.

Flow (M4):
  1. Decode JPEG → BGR ndarray.
  2. detect → embed → top-1 search (single-thread GPU executor).
  3. Soft-quality gates (detection score / face area).
  4. Apply RECOGNITION_THRESHOLD_STRONG / SOFT.
  5. Debounce per kiosk_id; only confirmed matches yield a token.
  6. (M5) anti-spoof slots in BEFORE step 4 — currently always returns p=1.0.

The handler in `app/api/recognize.py` is a thin adapter that wires DB
lookups, the FaceEngine, the debouncer, and the pending-token store.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np

from app.core.anti_spoof import AntiSpoofEngine
from app.core.face_engine import FaceEngine
from app.db.schemas import RecognizeStatus

logger = logging.getLogger(__name__)


@dataclass
class FrameResult:
    """All the M4 envelope needs from a single frame."""

    status: RecognizeStatus
    employee_id: int | None
    confidence: float
    anti_spoof_score: float  # M5: real-prob; M4 stub = 1.0


def decode_jpeg(buf: bytes) -> np.ndarray | None:
    arr = np.frombuffer(buf, dtype=np.uint8)
    if arr.size == 0:
        return None
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def run_pipeline(
    engine: FaceEngine,
    bgr: np.ndarray,
    *,
    threshold_strong: float,
    threshold_soft: float,
    anti_spoof: AntiSpoofEngine | None = None,
    anti_spoof_threshold: float = 0.8,
) -> FrameResult:
    """The blocking portion — runs on the single-thread GPU executor."""
    face = engine.detect_largest(bgr)
    if face is None:
        return FrameResult(RecognizeStatus.no_face, None, 0.0, 1.0)

    bbox = face.bbox
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if face.det_score < 0.5 or w * h < 80 * 80:
        logger.debug(
            "low_quality det=%.2f bbox=%dx%d", float(face.det_score), int(w), int(h),
        )
        return FrameResult(RecognizeStatus.low_quality, None, 0.0, 1.0)

    # Anti-spoof — runs BEFORE embedding so we fail fast on spoof attempts.
    # When models aren't present the engine returns 1.0 (always real) and the
    # whole runtime degrades gracefully to M4 behavior. See CLAUDE.md.
    anti_spoof_score = anti_spoof.score(bgr, bbox) if anti_spoof else 1.0
    if anti_spoof is not None and anti_spoof.enabled and anti_spoof_score < anti_spoof_threshold:
        logger.info(
            "spoof reject anti_spoof_score=%.3f threshold=%.2f", anti_spoof_score, anti_spoof_threshold
        )
        return FrameResult(RecognizeStatus.spoof, None, 0.0, anti_spoof_score)

    emb = engine.embed(face)
    employee_id, sim = engine.search(emb)

    # Per-frame numbers at DEBUG — viewable via LOG_LEVEL=DEBUG; silent in prod.
    logger.debug(
        "det=%.2f sim=%.3f emp=%s thr=%.2f",
        float(face.det_score), sim, employee_id, threshold_strong,
    )

    if employee_id is None or sim < threshold_soft:
        return FrameResult(RecognizeStatus.unknown, None, max(0.0, sim), anti_spoof_score)

    if sim < threshold_strong:
        # Borderline match — keep at INFO so the operator can spot enrollment
        # candidates whose photo set should be expanded.
        logger.info(
            "soft-match emp_id=%s sim=%.3f (between %.2f and %.2f)",
            employee_id, sim, threshold_soft, threshold_strong,
        )
        return FrameResult(RecognizeStatus.unknown, None, sim, anti_spoof_score)

    return FrameResult(
        RecognizeStatus.recognized, employee_id, sim, anti_spoof_score
    )
