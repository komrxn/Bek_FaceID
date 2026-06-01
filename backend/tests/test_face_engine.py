"""FaceEngine sanity tests — the ML core that the whole product hinges on.

Kept light so they run in <10 s on Mac CPU. They lock in the contract:
  - detect_largest returns a Face with the expected shape
  - embed produces (1, 512) float32 L2-normalized
  - search returns the enrolled id with cosine ~1.0 for the same image
  - search returns a low similarity for a different face
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.core.face_engine import EMBEDDING_DIM, FaceEngine


def _read_jpeg(path) -> np.ndarray:
    img = cv2.imread(str(path))
    assert img is not None, f"failed to read {path}"
    return img


def test_detect_largest_finds_one_face(face_engine: FaceEngine, fixture_jpeg_paths):
    img = _read_jpeg(fixture_jpeg_paths["komron"])
    face = face_engine.detect_largest(img)
    assert face is not None
    assert face.det_score > 0.5, f"expected confident detection, got {face.det_score}"
    assert face.bbox is not None and len(face.bbox) == 4


def test_embedding_shape_and_normalization(face_engine: FaceEngine, fixture_jpeg_paths):
    img = _read_jpeg(fixture_jpeg_paths["komron"])
    face = face_engine.detect_largest(img)
    assert face is not None
    emb = face_engine.embed(face)
    assert emb.shape == (1, EMBEDDING_DIM)
    assert emb.dtype == np.float32
    # L2 norm should be ~1.0 after normalize_L2.
    assert abs(float(np.linalg.norm(emb)) - 1.0) < 1e-5


def test_round_trip_self_match(face_engine: FaceEngine, fixture_jpeg_paths):
    """Enroll a face, query the same image — must come back as that employee."""
    face_engine.reset()
    img = _read_jpeg(fixture_jpeg_paths["komron"])
    face = face_engine.detect_largest(img)
    assert face is not None
    emb = face_engine.embed(face)
    face_engine.add(employee_id=42, normalized_embedding=emb)

    hit_id, sim = face_engine.search(emb)
    assert hit_id == 42
    assert sim > 0.99


def test_different_face_does_not_match(face_engine: FaceEngine, fixture_jpeg_paths):
    """A different person's face should produce low similarity to the enrolled one."""
    face_engine.reset()

    # Enroll Komron.
    komron_img = _read_jpeg(fixture_jpeg_paths["komron"])
    komron_face = face_engine.detect_largest(komron_img)
    assert komron_face is not None
    face_engine.add(employee_id=1, normalized_embedding=face_engine.embed(komron_face))

    # Query with Ashraf.
    ashraf_img = _read_jpeg(fixture_jpeg_paths["ashraf"])
    ashraf_face = face_engine.detect_largest(ashraf_img)
    assert ashraf_face is not None
    hit_id, sim = face_engine.search(face_engine.embed(ashraf_face))
    # Different person → low cosine. Below STRONG threshold; below SOFT too in
    # most cases. Pin to 0.5 to allow a generous margin against ArcFace drift.
    assert sim < 0.5, f"expected low similarity for different person, got {sim}"
    # hit_id is still the only enrolled id, but the caller's threshold check rejects it.
    assert hit_id == 1


def test_reset_clears_index(face_engine: FaceEngine, fixture_jpeg_paths):
    face_engine.reset()
    assert face_engine.size == 0

    img = _read_jpeg(fixture_jpeg_paths["komron"])
    face = face_engine.detect_largest(img)
    assert face is not None
    face_engine.add(1, face_engine.embed(face))
    assert face_engine.size == 1

    face_engine.reset()
    assert face_engine.size == 0
    hit_id, sim = face_engine.search(face_engine.embed(face))
    assert hit_id is None
    assert sim == 0.0
