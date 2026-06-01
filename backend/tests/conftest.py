"""Shared pytest fixtures.

Loading buffalo_l takes ~5 s on Mac CoreML. We load it once per session and
share it across tests via a `face_engine` fixture (session-scoped).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.face_engine import FaceEngine

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def _detect_providers() -> list[str]:
    """Pick providers that exist on the current platform.

    Local dev: CoreML on Mac, CUDA on Linux+NVIDIA, CPU everywhere.
    CI: just CPU.
    """
    try:
        import onnxruntime as ort

        available = set(ort.get_available_providers())
    except Exception:  # pragma: no cover
        return ["CPUExecutionProvider"]

    preferred = [
        "CUDAExecutionProvider",
        "CoreMLExecutionProvider",
        "CPUExecutionProvider",
    ]
    return [p for p in preferred if p in available] or ["CPUExecutionProvider"]


@pytest.fixture(scope="session")
def face_engine() -> FaceEngine:
    return FaceEngine(providers=_detect_providers())


@pytest.fixture(scope="session")
def fixture_jpeg_paths() -> dict[str, Path]:
    return {
        "komron": FIXTURES_DIR / "komron_real.jpg",
        "ashraf": FIXTURES_DIR / "ashraf_real.jpg",
    }
