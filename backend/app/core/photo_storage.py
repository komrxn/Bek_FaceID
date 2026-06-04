"""Employee-photo storage on disk + EXIF-aware JPEG decoder.

Layout: `<DATA_DIR>/employee_photos/<employee_id>/<uuid4>.jpg`

Why UUID4 filenames:
  * No PII in the filename.
  * Collision-safe (no risk of two enrollments overwriting each other).
  * Easy garbage collection — orphans are obvious when joined to the
    face_embeddings table.

Originals are resized to max 1024 px on the longest side before saving —
this keeps storage bounded and recognition quality untouched (InsightFace
internally resizes to 640×640 for detection).

V1.1 — EXIF rotation fix:
  Phone cameras (especially iPhone / iPad rear camera in portrait) write
  orientation as an EXIF tag rather than rotating the actual pixels.
  Both `cv2.imdecode` and bare `PIL.Image.open` ignore that tag. Without
  correction, portrait shots from the iPad enrollment flow:
    (a) display rotated 90° in the admin UI, and
    (b) make the face detector miss the face — embedding extracted from
        a sideways face is junk and degrades recognition.
  `decode_image_with_exif` applies `ImageOps.exif_transpose` (rotates
  pixels to match the tag, strips the tag) and returns both:
    * an upright PIL RGB image (consumed by `PhotoStorage.save` for resize+save)
    * an upright BGR numpy array (consumed by the face engine)
  Both paths share a single decode step, so what's saved is exactly what
  the embedding was extracted from.
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

MAX_DIM_PX = 1024
JPEG_QUALITY = 90


def decode_image_with_exif(raw_bytes: bytes) -> tuple[Image.Image, np.ndarray]:
    """Decode a JPEG, applying EXIF orientation, into (PIL RGB image, BGR ndarray).

    Raises if `raw_bytes` is empty or not a decodable image.
    """
    if not raw_bytes:
        raise ValueError("empty image bytes")
    img = Image.open(io.BytesIO(raw_bytes))
    img = ImageOps.exif_transpose(img)  # rotate pixels to match EXIF tag
    rgb = img.convert("RGB")
    bgr = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
    return rgb, bgr


class PhotoStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _employee_dir(self, employee_id: int) -> Path:
        d = self.root / str(employee_id)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save(self, employee_id: int, raw_bytes: bytes) -> tuple[Path, str]:
        """Persist a JPEG photo (rotating per EXIF before save).
        Returns (absolute_path, relative_path)."""
        img, _ = decode_image_with_exif(raw_bytes)

        w, h = img.size
        longest = max(w, h)
        if longest > MAX_DIM_PX:
            scale = MAX_DIM_PX / longest
            img = img.resize(
                (int(round(w * scale)), int(round(h * scale))),
                Image.Resampling.LANCZOS,
            )

        filename = f"{uuid.uuid4().hex}.jpg"
        abs_path = self._employee_dir(employee_id) / filename
        # No `exif=` kwarg — pixels are already upright, save without
        # orientation tag to keep downstream viewers honest.
        img.save(abs_path, format="JPEG", quality=JPEG_QUALITY, optimize=True)

        # Relative path is stored in DB (portable across deployments).
        rel_path = f"{employee_id}/{filename}"
        return abs_path, rel_path

    def delete(self, employee_id: int) -> None:
        """Remove an employee's entire photo directory."""
        d = self.root / str(employee_id)
        if d.exists():
            for f in d.iterdir():
                f.unlink(missing_ok=True)
            d.rmdir()

    def delete_file(self, rel_path: str) -> None:
        """Delete a single photo by its DB-stored relative path.

        Used when removing one of an employee's reference photos without
        wiping the whole directory. Tolerates a missing file — the DB row
        is the source of truth.
        """
        if not rel_path:
            return
        abs_path = self.root / rel_path
        # Hard guard against path traversal — `rel_path` comes from the DB
        # (already constrained to `<emp_id>/<uuid>.jpg`), but be paranoid.
        try:
            abs_path.relative_to(self.root)
        except ValueError:
            return
        abs_path.unlink(missing_ok=True)
