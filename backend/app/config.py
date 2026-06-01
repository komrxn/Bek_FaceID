"""Application settings — env-driven, validated by Pydantic.

All thresholds and runtime knobs live here. Inherits the pattern from
FaceDet_ai/src/config.py (constants module) but upgraded to pydantic-settings
so the same code runs in dev, docker-compose, and prod via env overrides.

See ~/.claude/plans/zesty-doodling-elephant.md §Recognition pipeline for
the meaning of each threshold.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Repo root, robust to CWD. backend/app/config.py → backend/ → repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT_ENV = _REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT_ENV),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Secrets ---
    session_secret: str = Field(default="dev-only-change-me-in-production-32chars+")

    # --- Paths ---
    # Defaults anchor to the repo root regardless of CWD. Override via .env if
    # you mount different paths in docker-compose.
    db_url: str = f"sqlite+aiosqlite:///{_REPO_ROOT}/data/bek.db"
    models_dir: Path = _REPO_ROOT / "models"
    data_dir: Path = _REPO_ROOT / "data"

    # --- InsightFace execution providers ---
    # Comma-separated. Examples:
    #   "CUDAExecutionProvider,CPUExecutionProvider"   (prod Linux + GPU)
    #   "CoreMLExecutionProvider,CPUExecutionProvider" (Mac dev)
    #   "CPUExecutionProvider"                          (CPU-only fallback)
    execution_providers: str = "CPUExecutionProvider"

    # --- Recognition thresholds (cosine similarity on L2-normalized 512-d embeddings) ---
    recognition_threshold_strong: float = 0.60
    recognition_threshold_soft: float = 0.50

    # --- Anti-spoof ---
    antispoof_threshold: float = 0.80

    # --- Server-side debounce (rolling deque per kiosk_id) ---
    debounce_window_ms: int = 2500
    debounce_required: int = 3
    debounce_of: int = 5

    # --- Kiosk / admin ---
    kiosk_timeout_s: int = 10
    admin_session_ttl_hours: int = 8
    pending_token_ttl_s: int = 15

    # --- Snapshot retention ---
    snapshot_retention_days: int = 90

    # --- Timezone (restaurant local time) ---
    # SQLite `datetime('now')` returns UTC. expected_arrival_time is naive
    # "HH:MM" in local time. derive_day_metrics() must compose them in this TZ.
    restaurant_tz: str = "Asia/Tashkent"

    # --- "Shift day" boundary for cross-midnight shifts ---
    # Events between 00:00 and this hour count toward the *previous* calendar day's
    # shift (e.g. cook arrives 22:00 Mon, leaves 03:00 Tue → both on Mon's row).
    # M6 attendance_metrics uses this.
    shift_day_cutoff_hour: int = 4

    # --- Helpers ---
    @property
    def execution_providers_list(self) -> list[str]:
        return [p.strip() for p in self.execution_providers.split(",") if p.strip()]

    @property
    def employee_photos_dir(self) -> Path:
        return self.data_dir / "employee_photos"

    @property
    def attendance_snapshots_dir(self) -> Path:
        return self.data_dir / "attendance_snapshots"


@lru_cache
def get_settings() -> Settings:
    return Settings()
