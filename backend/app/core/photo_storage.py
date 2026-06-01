"""Employee-photo storage on disk.

Layout: `<DATA_DIR>/employee_photos/<employee_id>/<uuid4>.jpg`

Why UUID4 filenames:
  * No PII in the filename.
  * Collision-safe (no risk of two enrollments overwriting each other).
  * Easy garbage collection — orphans are obvious when joined to the
    face_embeddings table.

Originals are resized to max 1024 px on the longest side before saving —
this keeps storage bounded and recognition quality untouched (InsightFace
internally resizes to 640×640 for detection).
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from PIL import Image

MAX_DIM_PX = 1024
JPEG_QUALITY = 90


class PhotoStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _employee_dir(self, employee_id: int) -> Path:
        d = self.root / str(employee_id)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save(self, employee_id: int, raw_bytes: bytes) -> tuple[Path, str]:
        """Persist a JPEG photo. Returns (absolute_path, relative_path)."""
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")

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
