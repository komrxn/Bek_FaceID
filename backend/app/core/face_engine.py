"""InsightFace + FAISS recognition core.

Ported from /Users/komrxn/Projects/FaceDet_ai/src/core/face_engine.py:135-178
(detect + embed + FAISS top-1). The JPEG-dir-hash cache from that file
(lines 34-72) is intentionally dropped: BEK_FaceID's source of truth is the
SQLite `face_embeddings` table, and the index is rebuilt on startup via
`rebuild_from_db()` — and re-built on employee deactivation.

Key invariants:
  * Embeddings are 512-d float32, L2-normalized before insertion.
  * FAISS uses `IndexFlatIP` so inner product == cosine similarity.
  * `self.ids` is a parallel list — `self.ids[faiss_row] -> employee_id`.
    Order matters; never reorder one without the other. To remove an
    employee, call `reset()` and re-add the survivors (cheap at ~240 vectors).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import faiss
import numpy as np
from insightface.app import FaceAnalysis

if TYPE_CHECKING:  # pragma: no cover
    from insightface.app.common import Face

logger = logging.getLogger(__name__)


EMBEDDING_DIM = 512
DETECTION_SIZE = (640, 640)


class FaceEngine:
    """InsightFace buffalo_l detect+embed + FAISS top-1 search.

    Thread-safety: instances are not thread-safe by themselves. Callers must
    funnel all `detect_largest`, `embed`, `search`, `add` calls through the
    single-thread executor in `core/executor.py`.
    """

    def __init__(self, providers: list[str]) -> None:
        logger.info("[FaceEngine] Initializing buffalo_l with providers=%s", providers)
        self.app = FaceAnalysis(name="buffalo_l", providers=providers)
        self.app.prepare(ctx_id=0, det_size=DETECTION_SIZE)

        self.index: faiss.IndexFlatIP = faiss.IndexFlatIP(EMBEDDING_DIM)
        self.ids: list[int] = []  # FAISS row -> employee_id

    # ---------------------------- detect / embed ----------------------------

    def detect_largest(self, bgr: np.ndarray) -> "Face | None":
        """Return the largest detected face, or None."""
        faces = self.app.get(bgr)
        if not faces:
            return None
        if len(faces) > 1:
            faces = sorted(
                faces,
                key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                reverse=True,
            )
        return faces[0]

    def embed(self, face: "Face") -> np.ndarray:
        """L2-normalize a Face's 512-d embedding. Returns shape (1, 512)."""
        emb = face.embedding.astype(np.float32)
        emb = np.expand_dims(emb, axis=0)
        faiss.normalize_L2(emb)
        return emb

    # ---------------------------- index management ----------------------------

    def add(self, employee_id: int, normalized_embedding: np.ndarray) -> None:
        """Append a single (1, 512) normalized embedding bound to `employee_id`."""
        if normalized_embedding.shape != (1, EMBEDDING_DIM):
            raise ValueError(
                f"expected shape (1, {EMBEDDING_DIM}); got {normalized_embedding.shape}"
            )
        self.index.add(normalized_embedding)
        self.ids.append(employee_id)

    def reset(self) -> None:
        """Drop all entries — used before a full rebuild."""
        self.index = faiss.IndexFlatIP(EMBEDDING_DIM)
        self.ids = []

    @property
    def size(self) -> int:
        return self.index.ntotal

    # ---------------------------- search ----------------------------

    def search(self, normalized_embedding: np.ndarray) -> tuple[int | None, float]:
        """Top-1 cosine similarity.

        Returns (employee_id, similarity). employee_id is None when the index
        is empty. The caller applies recognition thresholds.
        """
        if self.index.ntotal == 0:
            return None, 0.0
        distances, indices = self.index.search(normalized_embedding, 1)
        sim = float(distances[0][0])
        idx = int(indices[0][0])
        return self.ids[idx], sim

    # ---------------------------- DB-backed rebuild ----------------------------

    def add_blob(self, employee_id: int, blob: bytes) -> None:
        """Add an already-normalized 512-d float32 embedding stored as 2048 bytes.

        Used by `rebuild_from_db()` and by the employees-CRUD path after the
        DB row is inserted. Trusts the caller — embeddings written to the DB
        are always L2-normalized by `embed()` first.
        """
        arr = np.frombuffer(blob, dtype=np.float32)
        if arr.size != EMBEDDING_DIM:
            raise ValueError(
                f"embedding blob has {arr.size} floats; expected {EMBEDDING_DIM}"
            )
        self.add(employee_id, arr.reshape(1, EMBEDDING_DIM))

    def rebuild_from_rows(
        self, rows: list[tuple[int, bytes]]
    ) -> None:
        """Drop the index and reload it from (employee_id, blob) tuples.

        Called on startup (lifespan) and after employee soft-delete. The
        caller queries the DB; this method has no DB awareness so it stays
        sync-friendly and CUDA-thread safe.
        """
        self.reset()
        for emp_id, blob in rows:
            self.add_blob(emp_id, blob)
        logger.info("[FaceEngine] rebuilt index: ntotal=%d", self.size)


# Helper for callers that have an unnormalized embedding and want the
# canonical bytes-blob shape for DB storage.
def embedding_to_blob(normalized_embedding: np.ndarray) -> bytes:
    """Serialize a (1, 512) float32 normalized embedding to DB-storage bytes."""
    if normalized_embedding.shape != (1, EMBEDDING_DIM):
        raise ValueError(
            f"expected shape (1, {EMBEDDING_DIM}); got {normalized_embedding.shape}"
        )
    return normalized_embedding.astype(np.float32).tobytes()
