"""Silent-Face anti-spoofing wrapper.

Two MiniFASNet ONNX models work in concert at different bbox scales (2.7 and
4.0) — averaging their softmax outputs yields a robust real/spoof signal.

Reference: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
Models are converted from the upstream .pth weights by
`scripts/export_silentface_onnx.py` (one-shot, run on install).

**Graceful fallback**: if the ONNX files aren't present (e.g. the operator
hasn't run the conversion script yet), this engine returns `p(real)=1.0` for
every frame and logs a single warning on startup. The runtime is still
useful — recognition + debounce + mark works — it just doesn't reject phone
photos. CLAUDE.md flags this clearly.
"""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x, axis=1, keepdims=True))
    return e / np.sum(e, axis=1, keepdims=True)


class AntiSpoofEngine:
    """Two-headed MiniFASNet ensemble for silent face anti-spoofing.

    On call: crops the input frame at two scales around the face bbox,
    feeds each crop into its respective ONNX session, and averages the
    softmax over the 3-class output (label 1 = real per upstream).
    """

    INPUT_SIZE = 80
    MODEL_FILES = (
        ("2.7_80x80_MiniFASNetV2.onnx", 2.7),
        ("4_0_0_80x80_MiniFASNetV1SE.onnx", 4.0),
    )

    def __init__(self, models_dir: Path, providers: list[str]) -> None:
        self._sessions: list[tuple[object, float, str]] = []
        if not models_dir.exists():
            logger.warning(
                "[AntiSpoof] models dir %s does not exist — running in no-op mode",
                models_dir,
            )
            return

        try:
            import onnxruntime as ort  # local import to avoid cost when unused
        except ImportError:  # pragma: no cover
            logger.error("[AntiSpoof] onnxruntime not available — disabled")
            return

        for name, scale in self.MODEL_FILES:
            path = models_dir / name
            if not path.exists():
                logger.warning(
                    "[AntiSpoof] missing %s — skipping (run scripts/export_silentface_onnx.py)",
                    path,
                )
                continue
            try:
                sess = ort.InferenceSession(str(path), providers=providers)
            except Exception as exc:  # pragma: no cover
                logger.error("[AntiSpoof] failed to load %s: %s", path, exc)
                continue
            input_name = sess.get_inputs()[0].name
            self._sessions.append((sess, scale, input_name))

        if not self._sessions:
            logger.warning(
                "[AntiSpoof] no models loaded — engine will return p(real)=1.0 for all frames"
            )
        else:
            logger.info("[AntiSpoof] loaded %d model(s)", len(self._sessions))

    @property
    def enabled(self) -> bool:
        return bool(self._sessions)

    def score(self, bgr: np.ndarray, bbox: np.ndarray) -> float:
        """Return p(real) ∈ [0, 1]. p(real)=1.0 when the engine has no models."""
        if not self._sessions:
            return 1.0

        h, w = bgr.shape[:2]
        x1, y1, x2, y2 = bbox.astype(int)
        face_w = x2 - x1
        face_h = y2 - y1
        if face_w <= 0 or face_h <= 0:
            return 1.0

        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2

        per_model: list[float] = []
        for sess, scale, input_name in self._sessions:
            crop_w = int(face_w * scale)
            crop_h = int(face_h * scale)
            cx1 = max(0, cx - crop_w // 2)
            cy1 = max(0, cy - crop_h // 2)
            cx2 = min(w, cx + crop_w // 2)
            cy2 = min(h, cy + crop_h // 2)
            crop = bgr[cy1:cy2, cx1:cx2]
            if crop.size == 0:
                continue

            inp = cv2.resize(crop, (self.INPUT_SIZE, self.INPUT_SIZE))
            inp = inp.astype(np.float32) / 255.0
            inp = inp.transpose(2, 0, 1)[None, ...]  # NCHW

            try:
                out = sess.run(None, {input_name: inp})[0]
            except Exception as exc:  # pragma: no cover
                logger.error("[AntiSpoof] inference error: %s", exc)
                continue

            probs = _softmax(out)  # shape (1, 3)
            # Upstream label scheme: class 1 = real face.
            per_model.append(float(probs[0, 1]))

        if not per_model:
            return 1.0
        return float(np.mean(per_model))
