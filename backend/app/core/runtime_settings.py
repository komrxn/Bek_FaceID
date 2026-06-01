"""Runtime-mutable settings — overrides over env defaults.

Why this exists: the manager wants to tune recognition / anti-spoof
thresholds and retention without SSH-ing into the server and editing
.env / restarting docker. We expose a tiny JSON file at
`<DATA_DIR>/runtime_settings.json` that the admin UI can PATCH.

Reads are O(1) and lock-free at the hot path (just a dict lookup) so the
recognize handler doesn't take a contended lock per frame.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import RLock
from typing import Any

logger = logging.getLogger(__name__)


# Each field: (cast, min, max). Bool fields use (bool, None, None).
SETTING_SPEC: dict[str, tuple[type, float | int | None, float | int | None]] = {
    "recognition_threshold_strong": (float, 0.50, 0.95),
    "antispoof_threshold":          (float, 0.50, 0.99),
    "snapshot_retention_days":      (int, 7, 365),
    "kiosk_sound_enabled":          (bool, None, None),
}


class RuntimeSettings:
    """Process-wide singleton; held on app.state.runtime_settings."""

    def __init__(self, path: Path, defaults: dict[str, Any]) -> None:
        self._path = path
        self._lock = RLock()
        # Clone defaults so we own them; only known keys.
        self._values: dict[str, Any] = {
            k: defaults[k] for k in SETTING_SPEC if k in defaults
        }
        if path.exists():
            try:
                disk = json.loads(path.read_text(encoding="utf-8"))
                for k, v in disk.items():
                    if k in SETTING_SPEC:
                        self._values[k] = self._coerce(k, v)
            except Exception as exc:
                logger.warning("runtime_settings: failed to load %s — using defaults (%s)", path, exc)

    @staticmethod
    def _coerce(key: str, v: Any) -> Any:
        kind, lo, hi = SETTING_SPEC[key]
        if kind is bool:
            return bool(v)
        if kind is float:
            return max(float(lo), min(float(hi), float(v)))  # type: ignore[arg-type]
        if kind is int:
            return max(int(lo), min(int(hi), int(v)))  # type: ignore[arg-type]
        return v

    # ---------------------------- read path ----------------------------

    def get(self, key: str) -> Any:
        return self._values.get(key)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._values)

    # ---------------------------- write path ----------------------------

    def update(self, patch: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            for k, v in patch.items():
                if k not in SETTING_SPEC or v is None:
                    continue
                self._values[k] = self._coerce(k, v)
            self._persist_locked()
            return dict(self._values)

    def _persist_locked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(self._path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(self._values, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(self._path)
