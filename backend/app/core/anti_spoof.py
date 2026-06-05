"""Silent-Face anti-spoofing wrapper.

Two MiniFASNet ONNX models work in concert at different bbox scales (2.7 and
4.0) — averaging their softmax outputs yields a robust real/spoof signal.

Reference: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
Models are converted from the upstream .pth weights by
`scripts/export_silentface_onnx.py` (one-shot, run on install).

### Critical detail: detector

Silent-Face is **extraordinarily sensitive** to the face bbox shape — it was
trained on crops produced by a specific Caffe RetinaFace (Widerface trained)
and a different detector (e.g. InsightFace SCRFD that the kiosk uses for
recognition) gives noticeably different proportions. Empirically: SCRFD
yields a bbox that's ~14 % narrower and includes more forehead than
RetinaFace; feeding the SCRFD bbox into Silent-Face collapses the model
output to a near-constant ~[0.06, 0.03, 1.91] for every frame, real or fake.

To fix this we ship the upstream Caffe model and run a SECOND detection
inside the anti-spoof engine. It's CPU and ~30 ms per frame on a downscaled
192 px input, which is well within the kiosk's 500 ms recognition cadence.

### Graceful fallback

If the ONNX files or the Caffe detector files aren't present (e.g. the
operator hasn't run the conversion script yet), this engine returns
`p(real)=1.0` for every frame and logs a single warning on startup. The
runtime is still useful — recognition + debounce + mark works — it just
doesn't reject phone photos. CLAUDE.md flags this clearly.
"""

from __future__ import annotations

import logging
import math
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x, axis=1, keepdims=True))
    return e / np.sum(e, axis=1, keepdims=True)


class _RetinaFaceDetector:
    """Tiny port of `src/anti_spoof_predict.py:Detection` from upstream.

    Returns the bbox of the highest-confidence face in (x, y, w, h) format,
    or None if no face above CONF=0.6 is found.
    """

    CONF_THRESHOLD = 0.6

    def __init__(self, models_dir: Path) -> None:
        caffemodel = models_dir / "detection" / "Widerface-RetinaFace.caffemodel"
        deploy = models_dir / "detection" / "deploy.prototxt"
        self._net = cv2.dnn.readNetFromCaffe(str(deploy), str(caffemodel))

    def detect(self, bgr: np.ndarray) -> tuple[int, int, int, int] | None:
        height, width = bgr.shape[0], bgr.shape[1]
        aspect_ratio = width / height
        # Downscale to ~192 px on the short side — matches upstream behaviour
        # AND keeps the detection at ~30 ms on CPU instead of ~120 ms full-res.
        if bgr.shape[1] * bgr.shape[0] >= 192 * 192:
            scaled = cv2.resize(
                bgr,
                (
                    int(192 * math.sqrt(aspect_ratio)),
                    int(192 / math.sqrt(aspect_ratio)),
                ),
                interpolation=cv2.INTER_LINEAR,
            )
        else:
            scaled = bgr
        blob = cv2.dnn.blobFromImage(scaled, 1, mean=(104, 117, 123))
        self._net.setInput(blob, "data")
        out = self._net.forward("detection_out").squeeze()
        if out.ndim < 2 or out.shape[0] == 0:
            return None
        # Pick the most-confident detection.
        max_conf_index = int(np.argmax(out[:, 2]))
        if out[max_conf_index, 2] < self.CONF_THRESHOLD:
            return None
        left = out[max_conf_index, 3] * width
        top = out[max_conf_index, 4] * height
        right = out[max_conf_index, 5] * width
        bottom = out[max_conf_index, 6] * height
        return (
            int(left),
            int(top),
            int(right - left + 1),
            int(bottom - top + 1),
        )


class AntiSpoofEngine:
    """Two-headed MiniFASNet ensemble for silent face anti-spoofing.

    On call: runs the upstream-trained RetinaFace detector to get a bbox
    in the model's native convention, crops the input frame at two scales
    around that bbox, feeds each crop into its respective ONNX session,
    sums the softmax outputs of both heads, and accepts iff argmax == 1
    (class index 1 == real face per upstream's labelling).
    """

    INPUT_SIZE = 80
    MODEL_FILES = (
        ("2.7_80x80_MiniFASNetV2.onnx", 2.7),
        ("4_0_0_80x80_MiniFASNetV1SE.onnx", 4.0),
    )

    def __init__(self, models_dir: Path, providers: list[str]) -> None:
        self._sessions: list[tuple[object, float, str]] = []
        self._detector: _RetinaFaceDetector | None = None

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

        # The RetinaFace detector is REQUIRED for the engine to be useful —
        # feeding SCRFD bboxes makes the MiniFASNet ensemble collapse to a
        # constant output. Without it, fall back to no-op mode rather than
        # silently returning garbage scores.
        detection_dir = models_dir / "detection"
        if not (detection_dir / "Widerface-RetinaFace.caffemodel").exists():
            logger.warning(
                "[AntiSpoof] Caffe RetinaFace not found at %s — disabling anti-spoof "
                "(the SCRFD bbox the kiosk uses for recognition is not compatible "
                "with Silent-Face's training distribution)",
                detection_dir,
            )
            self._sessions = []
            return

        try:
            self._detector = _RetinaFaceDetector(models_dir)
        except Exception as exc:
            logger.error("[AntiSpoof] failed to load RetinaFace detector: %s", exc)
            self._sessions = []
            return

        if not self._sessions:
            logger.warning(
                "[AntiSpoof] no models loaded — engine will return p(real)=1.0 for all frames"
            )
        else:
            logger.info(
                "[AntiSpoof] loaded %d model(s) + RetinaFace detector", len(self._sessions)
            )

    @property
    def enabled(self) -> bool:
        return bool(self._sessions) and self._detector is not None

    @staticmethod
    def _get_new_box(
        src_w: int, src_h: int, bbox: tuple[int, int, int, int], scale: float
    ) -> tuple[int, int, int, int]:
        """Port of `src/generate_patches.py:_get_new_box` from upstream."""
        x, y, box_w, box_h = bbox
        scale = min((src_h - 1) / box_h, min((src_w - 1) / box_w, scale))
        new_width = box_w * scale
        new_height = box_h * scale
        center_x = box_w / 2 + x
        center_y = box_h / 2 + y
        left_top_x = center_x - new_width / 2
        left_top_y = center_y - new_height / 2
        right_bottom_x = center_x + new_width / 2
        right_bottom_y = center_y + new_height / 2
        if left_top_x < 0:
            right_bottom_x -= left_top_x
            left_top_x = 0
        if left_top_y < 0:
            right_bottom_y -= left_top_y
            left_top_y = 0
        if right_bottom_x > src_w - 1:
            left_top_x -= right_bottom_x - src_w + 1
            right_bottom_x = src_w - 1
        if right_bottom_y > src_h - 1:
            left_top_y -= right_bottom_y - src_h + 1
            right_bottom_y = src_h - 1
        return (
            int(left_top_x),
            int(left_top_y),
            int(right_bottom_x),
            int(right_bottom_y),
        )

    def score(self, bgr: np.ndarray, bbox: np.ndarray) -> float:
        """Return p(real) ∈ [0, 1]. p(real)=1.0 when the engine has no models.

        `bbox` is the InsightFace SCRFD bbox from the kiosk's recognition
        detector. We IGNORE it for anti-spoof and re-detect with RetinaFace,
        because the two detectors disagree on bbox proportions and Silent-Face
        only matches its training distribution under RetinaFace.

        The kiosk's bbox parameter is kept in the signature for API stability
        (and as a hint: if SCRFD didn't find a face, we don't bother running
        the second detector either).
        """
        if not self._sessions or self._detector is None:
            return 1.0
        if bbox is None or bbox.size == 0:
            return 1.0

        # Re-detect with RetinaFace — see class docstring for why.
        retina_bbox = self._detector.detect(bgr)
        if retina_bbox is None:
            # Kiosk's SCRFD found a face but Silent-Face's RetinaFace didn't.
            # Most likely a partial / profile face — defer to a future frame.
            # Returning 1.0 means the kiosk doesn't reject this frame on the
            # anti-spoof axis (debouncer needs N consecutive frames anyway).
            return 1.0

        src_h, src_w = bgr.shape[:2]
        per_head_softmax = np.zeros((1, 3), dtype=np.float32)
        used_heads = 0
        for sess, scale, input_name in self._sessions:
            lx, ly, rx, ry = self._get_new_box(src_w, src_h, retina_bbox, scale)
            crop = bgr[ly : ry + 1, lx : rx + 1]
            if crop.size == 0:
                continue
            inp = cv2.resize(crop, (self.INPUT_SIZE, self.INPUT_SIZE))
            # CRITICAL: do NOT normalize to [0, 1]. Silent-Face's upstream
            # `to_tensor` explicitly comments out the `.div(255)` call (see
            # `src/data_io/functional.py`), meaning the network was trained
            # on raw uint8-as-float values in [0, 255]. Dividing here makes
            # all model outputs collapse to a constant ~[0.06, 0.03, 1.91]
            # regardless of input — debugged with the upstream sample images.
            inp = inp.astype(np.float32)
            inp = inp.transpose(2, 0, 1)[None, ...]  # NCHW
            try:
                out = sess.run(None, {input_name: inp})[0]
            except Exception as exc:  # pragma: no cover
                logger.error("[AntiSpoof] inference error: %s", exc)
                continue
            per_head_softmax += _softmax(out)
            used_heads += 1

        if used_heads == 0:
            return 1.0

        # Upstream's verdict logic: argmax over summed softmax; class 1 = real.
        # We expose the actual p(real) so the recognition_service can compare
        # it against a tunable threshold (ANTISPOOF_THRESHOLD via runtime
        # settings) rather than a hard argmax — useful when the manager wants
        # to be stricter or laxer than the upstream default.
        normed = per_head_softmax / used_heads
        return float(normed[0, 1])
