"""Short-lived tokens that bind /api/recognize → /api/attendance/mark.

When the server confirms a debounce-stabilized recognition, it mints a token
the kiosk must echo back to mark attendance. This prevents:
  * Replay from a stale recognition envelope.
  * The kiosk marking attendance for a different employee than the one
    that was just confirmed.
  * Drive-by curl to /api/attendance/mark with arbitrary employee_id.

The token is opaque UUID4 and expires after `pending_token_ttl_s` (default 15 s).
In-process dict; same single-worker constraint as the debouncer.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from threading import Lock


@dataclass
class PendingEvent:
    employee_id: int
    kiosk_id: str
    confidence: float
    anti_spoof_score: float
    expires_at: float  # monotonic seconds


@dataclass
class PendingTokens:
    ttl_s: float = 15.0
    _state: dict[str, PendingEvent] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def mint(
        self,
        *,
        employee_id: int,
        kiosk_id: str,
        confidence: float,
        anti_spoof_score: float,
    ) -> str:
        token = uuid.uuid4().hex
        with self._lock:
            self._purge_expired_locked()
            self._state[token] = PendingEvent(
                employee_id=employee_id,
                kiosk_id=kiosk_id,
                confidence=confidence,
                anti_spoof_score=anti_spoof_score,
                expires_at=time.monotonic() + self.ttl_s,
            )
        return token

    def consume(self, token: str) -> PendingEvent | None:
        with self._lock:
            self._purge_expired_locked()
            return self._state.pop(token, None)

    def _purge_expired_locked(self) -> None:
        now = time.monotonic()
        expired = [t for t, ev in self._state.items() if ev.expires_at < now]
        for t in expired:
            self._state.pop(t, None)
