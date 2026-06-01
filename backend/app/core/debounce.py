"""Server-side recognition debounce.

The kiosk polls ~3.3 fps. A single recognized frame is not enough to commit
to an identity — lighting, motion blur and partial occlusions can briefly
swing the FAISS top-1. We require **≥3 matches of the same employee within
the last 5 frames** (covering ~1.5 s of real time) before signaling that
attendance can be marked.

State is per-process in-memory (one deque per `kiosk_id`). Uvicorn must
run with `--workers 1` (see CLAUDE.md §Single-worker constraint). Tests
construct a fresh `Debouncer` per test.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock


def _now_ms() -> float:
    return time.monotonic() * 1000.0


@dataclass
class Debouncer:
    capacity: int = 5
    window_ms: int = 2500
    required: int = 3
    _state: dict[str, deque[tuple[int, float]]] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def register(self, kiosk_id: str, employee_id: int) -> bool:
        """Record a candidate match.

        Returns True when the candidate is "confirmed" — i.e. ≥`required` of
        the entries in the rolling window are the same `employee_id`.
        Confirming does NOT clear the window; the next call will keep
        returning True for the same employee as long as they remain in
        view, which is what the kiosk wants.
        """
        with self._lock:
            now = _now_ms()
            dq = self._state.setdefault(kiosk_id, deque(maxlen=self.capacity))
            dq.append((employee_id, now))
            cutoff = now - self.window_ms
            while dq and dq[0][1] < cutoff:
                dq.popleft()
            count = sum(1 for emp_id, _ in dq if emp_id == employee_id)
            return count >= self.required

    def reset(self, kiosk_id: str | None = None) -> None:
        """Clear a specific kiosk's window (or all). Used by tests and after
        successful attendance marking, so a re-arrival starts a fresh count.
        """
        with self._lock:
            if kiosk_id is None:
                self._state.clear()
            else:
                self._state.pop(kiosk_id, None)
