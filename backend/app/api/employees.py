"""CRUD endpoints for employees + photo enrollment.

Enrollment is the highest-friction admin task — managers will be doing it
80 times. Optimize for:
  * Synchronous validation: if a photo has no face, fail fast before any
    state is written (HTTP 422).
  * One DB transaction per employee — no half-enrolled state.
  * Mirror in-memory FAISS index with each successful insert; failures
    leave the index untouched.

Auth: M2 leaves these endpoints open so M2 can be verified with curl.
M3 adds `Depends(require_admin)` to every route below.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Path,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin
from app.core.executor import get_executor
from app.core.face_engine import FaceEngine, embedding_to_blob
from app.core.photo_storage import PhotoStorage, decode_image_with_exif
from app.db import crud
from app.db.models import Employee
from app.db.schemas import EmployeeCreated, EmployeeListItem, EmployeeUpdate
from app.deps import get_db, get_face_engine, get_photo_storage

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/employees",
    tags=["employees"],
    dependencies=[Depends(require_admin)],
)

DEPARTMENT_REGEX = r"^(hall|kitchen|other)$"


def _photo_url(photo_path: str | None) -> str | None:
    return f"/static/employee_photos/{photo_path}" if photo_path else None


def _to_list_item(emp: Employee) -> EmployeeListItem:
    return EmployeeListItem(
        id=emp.id,
        full_name=emp.full_name,
        position=emp.position,
        department=emp.department,
        phone=emp.phone,
        photo_url=_photo_url(emp.photo_path),
        is_active=bool(emp.is_active),
        embeddings_count=len(emp.embeddings),
    )


def _to_created(emp: Employee, quality_scores: list[float]) -> EmployeeCreated:
    return EmployeeCreated(
        id=emp.id,
        full_name=emp.full_name,
        position=emp.position,
        department=emp.department,
        phone=emp.phone,
        photo_url=_photo_url(emp.photo_path),
        is_active=bool(emp.is_active),
        photo_quality_scores=quality_scores,
    )


def _detect_and_embed_blocking(
    engine: FaceEngine, raw_bytes: bytes
) -> tuple[bytes, float] | None:
    """Decode JPEG (respecting EXIF orientation), detect largest face, embed.

    Returns (blob, det_score) or None.

    EXIF orientation: phone cameras write the orientation as an EXIF tag
    rather than rotating pixels. `decode_image_with_exif` applies the tag
    so portrait shots arrive upright — both the face detector and the
    saved JPEG see the same upright image.
    """
    if not raw_bytes:
        return None
    try:
        _, bgr = decode_image_with_exif(raw_bytes)
    except Exception:  # pragma: no cover — malformed file
        return None
    face = engine.detect_largest(bgr)
    if face is None:
        return None
    emb = engine.embed(face)
    return embedding_to_blob(emb), float(face.det_score)


# ---------------------------- routes ----------------------------


@router.get("", response_model=list[EmployeeListItem])
async def list_endpoint(
    only_active: bool = False,
    session: AsyncSession = Depends(get_db),
) -> list[EmployeeListItem]:
    rows = await crud.list_employees(session, only_active=only_active)
    return [_to_list_item(r) for r in rows]


@router.get("/{employee_id}", response_model=EmployeeListItem)
async def get_endpoint(
    employee_id: Annotated[int, Path(gt=0)],
    session: AsyncSession = Depends(get_db),
) -> EmployeeListItem:
    emp = await crud.get_employee(session, employee_id)
    if emp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return _to_list_item(emp)


@router.post(
    "",
    response_model=EmployeeCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_endpoint(
    full_name: Annotated[str, Form(min_length=1, max_length=255)],
    position: Annotated[str, Form(min_length=1, max_length=255)],
    department: Annotated[str, Form(pattern=DEPARTMENT_REGEX)] = "hall",
    photos: list[UploadFile] = File(..., description="1–3 face photos"),
    phone: Annotated[str | None, Form()] = None,
    session: AsyncSession = Depends(get_db),
    engine: FaceEngine = Depends(get_face_engine),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> EmployeeCreated:
    if not 1 <= len(photos) <= 3:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Need 1–3 reference photos.",
        )

    # 1) Read + validate every photo BEFORE touching the DB.
    raw_photos: list[bytes] = []
    for ph in photos:
        data = await ph.read()
        if not data:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Photo '{ph.filename}' is empty.",
            )
        raw_photos.append(data)

    loop = asyncio.get_running_loop()
    detect_results: list[tuple[bytes, float] | None] = await asyncio.gather(
        *(
            loop.run_in_executor(
                get_executor(), _detect_and_embed_blocking, engine, raw
            )
            for raw in raw_photos
        )
    )

    bad_indices = [i for i, r in enumerate(detect_results) if r is None]
    if bad_indices:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "msg": "No face detected in some photos.",
                "bad_photo_indices": bad_indices,
            },
        )

    # 2) Create employee row to get the id (needed for the photo dir).
    emp = await crud.create_employee(
        session,
        full_name=full_name.strip(),
        position=position.strip(),
        department=department,
        phone=phone.strip() if phone else None,
    )

    # 3) Persist each photo + embedding row in the same transaction.
    quality_scores: list[float] = []
    primary_path: str | None = None
    for idx, (raw, result) in enumerate(zip(raw_photos, detect_results, strict=True)):
        assert result is not None  # narrowed by check above
        blob, det_score = result
        _, rel_path = storage.save(emp.id, raw)
        if idx == 0:
            primary_path = rel_path
        await crud.add_embedding(
            session,
            employee_id=emp.id,
            embedding_blob=blob,
            source_photo_path=rel_path,
            quality_score=det_score,
        )
        quality_scores.append(round(det_score, 3))

    emp.photo_path = primary_path
    await session.commit()
    await session.refresh(emp)

    # 4) Mirror into FAISS — single-thread executor keeps the CUDA stream
    #    serialized against in-flight /api/recognize calls.
    def _mirror_blocking() -> None:
        for _, result in zip(raw_photos, detect_results, strict=True):
            assert result is not None
            blob, _ = result
            engine.add_blob(emp.id, blob)

    await loop.run_in_executor(get_executor(), _mirror_blocking)
    logger.info(
        "[employees] created emp_id=%s name=%s photos=%d index_ntotal=%d",
        emp.id,
        emp.full_name,
        len(raw_photos),
        engine.size,
    )
    return _to_created(emp, quality_scores)


@router.patch("/{employee_id}", response_model=EmployeeListItem)
async def patch_endpoint(
    employee_id: Annotated[int, Path(gt=0)],
    payload: EmployeeUpdate,
    session: AsyncSession = Depends(get_db),
    engine: FaceEngine = Depends(get_face_engine),
) -> EmployeeListItem:
    emp = await crud.get_employee(session, employee_id)
    if emp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    was_active = bool(emp.is_active)

    fields = payload.model_dump(exclude_unset=True)
    # is_active comes in as bool; ORM uses 0/1.
    if "is_active" in fields and fields["is_active"] is not None:
        fields["is_active"] = 1 if fields["is_active"] else 0

    await crud.update_employee(session, emp, **fields)
    await session.commit()
    await session.refresh(emp)

    # Active flag changed → FAISS must reflect it.
    if was_active != bool(emp.is_active):
        await _rebuild_index_from_db(session, engine)

    return _to_list_item(emp)


@router.delete(
    "/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_endpoint(
    employee_id: Annotated[int, Path(gt=0)],
    hard: bool = False,
    session: AsyncSession = Depends(get_db),
    engine: FaceEngine = Depends(get_face_engine),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> Response:
    """Default: soft-delete (deactivate, keep history). `?hard=true` wipes
    the employee row + embeddings + photos. Attendance events remain (their
    FK is non-cascading) for audit, but the employee is no longer listed."""
    emp = await crud.get_employee(session, employee_id)
    if emp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    if hard:
        # Embeddings cascade on FK; attendance events keep emp_id but the
        # employee row is gone.
        emp_id = emp.id
        await session.delete(emp)
        await session.commit()
        # Clean photo directory off-disk (best effort).
        try:
            storage.delete(emp_id)
        except Exception as exc:  # pragma: no cover
            logger.warning("[employees] delete photos failed: %s", exc)
        await _rebuild_index_from_db(session, engine)
        logger.info("[employees] HARD-deleted emp_id=%s", emp_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    await crud.deactivate_employee(session, emp)
    await session.commit()
    await _rebuild_index_from_db(session, engine)
    logger.info("[employees] deactivated emp_id=%s", employee_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{employee_id}/photos",
    response_model=EmployeeListItem,
    status_code=status.HTTP_200_OK,
)
async def add_photos_endpoint(
    employee_id: Annotated[int, Path(gt=0)],
    photos: list[UploadFile] = File(..., description="1–3 additional face photos"),
    session: AsyncSession = Depends(get_db),
    engine: FaceEngine = Depends(get_face_engine),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> EmployeeListItem:
    """Append more reference photos to an existing employee.

    Used by the edit-employee flow. Same fail-fast pattern as create —
    every photo must contain a face or the whole batch is rejected.
    """
    emp = await crud.get_employee(session, employee_id)
    if emp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    if not 1 <= len(photos) <= 3:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Need 1–3 reference photos."
        )

    raw_photos: list[bytes] = []
    for ph in photos:
        data = await ph.read()
        if not data:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Photo '{ph.filename}' is empty.",
            )
        raw_photos.append(data)

    loop = asyncio.get_running_loop()
    detect_results: list[tuple[bytes, float] | None] = await asyncio.gather(
        *(
            loop.run_in_executor(
                get_executor(), _detect_and_embed_blocking, engine, raw
            )
            for raw in raw_photos
        )
    )
    bad_indices = [i for i, r in enumerate(detect_results) if r is None]
    if bad_indices:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "msg": "No face detected in some photos.",
                "bad_photo_indices": bad_indices,
            },
        )

    for raw, result in zip(raw_photos, detect_results, strict=True):
        assert result is not None
        blob, det_score = result
        _, rel_path = storage.save(emp.id, raw)
        await crud.add_embedding(
            session,
            employee_id=emp.id,
            embedding_blob=blob,
            source_photo_path=rel_path,
            quality_score=det_score,
        )
        # If employee had no primary photo (shouldn't happen, but be safe).
        if emp.photo_path is None:
            emp.photo_path = rel_path

    await session.commit()
    await session.refresh(emp)

    def _mirror_blocking() -> None:
        for _, result in zip(raw_photos, detect_results, strict=True):
            assert result is not None
            blob, _ = result
            engine.add_blob(emp.id, blob)

    await loop.run_in_executor(get_executor(), _mirror_blocking)
    logger.info(
        "[employees] added %d photo(s) to emp_id=%s (index_ntotal=%d)",
        len(raw_photos),
        emp.id,
        engine.size,
    )
    return _to_list_item(emp)


async def _rebuild_index_from_db(
    session: AsyncSession, engine: FaceEngine
) -> None:
    """Drop and rebuild FAISS from active employees' embeddings."""
    rows = await crud.iter_active_embeddings(session)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        get_executor(), engine.rebuild_from_rows, list(rows)
    )
