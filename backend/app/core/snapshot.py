"""Downscaled JPEG snapshot of confirmed attendance events.

We only snapshot the frame at `/api/attendance/mark` time (not on every
recognized frame) so disk growth is bounded. Layout:

    <DATA_DIR>/attendance_snapshots/YYYY-MM-DD/HHMMSS_emp<id>.jpg

Returns the path relative to DATA_DIR for storage in the DB.
"""

from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path

from PIL import Image

SNAPSHOT_MAX_WIDTH = 640
SNAPSHOT_QUALITY = 80


def save_snapshot(
    *, raw_jpeg: bytes, employee_id: int, root: Path
) -> str:
    """Persist a snapshot. Returns relative path like 'YYYY-MM-DD/HHMMSS_emp1.jpg'."""
    now = datetime.now()
    date_dir = now.strftime("%Y-%m-%d")
    abs_dir = root / date_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{now.strftime('%H%M%S')}_emp{employee_id}.jpg"
    abs_path = abs_dir / filename

    img = Image.open(io.BytesIO(raw_jpeg)).convert("RGB")
    w, h = img.size
    if w > SNAPSHOT_MAX_WIDTH:
        scale = SNAPSHOT_MAX_WIDTH / w
        img = img.resize(
            (SNAPSHOT_MAX_WIDTH, int(round(h * scale))),
            Image.Resampling.LANCZOS,
        )
    img.save(abs_path, format="JPEG", quality=SNAPSHOT_QUALITY, optimize=True)

    return f"{date_dir}/{filename}"
