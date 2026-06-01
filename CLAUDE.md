# BEK_FaceID — Project Conventions

Face ID employee attendance kiosk for restaurant **БЕК**. Tablet at the entrance, Chromium in kiosk mode → local Linux server with NVIDIA GPU on the LAN. Employees see their face, tap "Пришёл" / "Ушёл". Admin enrolls staff, views dashboard, exports monthly табель to xlsx for accountant Зарина.

Full implementation plan: `~/.claude/plans/zesty-doodling-elephant.md`.

## Stack — non-negotiable

- **Backend**: FastAPI + Uvicorn (`--workers 1`, see "Single-worker constraint"), SQLAlchemy 2.0 async + aiosqlite, Alembic.
- **Recognition**: InsightFace `buffalo_l` (RetinaFace + ArcFace 512-d) via `onnxruntime-gpu`. FAISS `IndexFlatIP` rebuilt from SQLite on startup.
- **Anti-spoof**: minivision-ai Silent-Face-Anti-Spoofing (MiniFASNetV1SE + V2), **converted to ONNX once at install** via `scripts/export_silentface_onnx.py`. Runtime image has **no PyTorch** — `onnxruntime-gpu` only.
- **Storage**: SQLite (`data/bek.db`, WAL mode). Embeddings as BLOB.
- **Auth**: `itsdangerous` signed-cookie session. Single admin role. LAN-only.
- **Frontend**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Framer Motion + React Router 6 + TanStack Query + react-hook-form + Zod + lucide-react (`stroke-width 1.75`) + cmdk + `@fontsource/inter`.
- **Excel**: openpyxl (matches existing БЕК financial-dashboard tooling).
- **Deploy**: docker-compose, backend on `nvidia/cuda:12.2.0-runtime-ubuntu22.04`, frontend on nginx (also proxies `/api/*`).

## Russian-language UI throughout

All UI strings in Russian. Dates/times via `Intl.DateTimeFormat('ru-RU')`. Typography polish via `frontend/src/lib/ru.ts` — «ёлочки», em-dash with hair spaces, nbsp before `г.` `руб.` and single-letter prepositions (`в`, `с`, `у`, `о`, `к`).

## Design philosophy — dual theme

- **Kiosk**: dark, hospitality-grade calm. Hotel concierge meets Apple Face ID meets Linear's restraint. `bek.darkBg=#0B1020`. Big, slow, oversized typography. One employee, one moment.
- **Admin**: light, dashboard-grade density. Inherits existing БЕК financial-dashboard tone (slate/indigo/blue/green on white). Compact, scannable.

One token system, two scopes. Spring presets: `calm 170/26`, `authority 220/30`, `snap 380/32`, `whisper 90/22`.

## Single-worker constraint

The recognition debounce (`app/core/debounce.py`) keeps a per-`kiosk_id` deque **in process memory**. Uvicorn MUST run with `--workers 1`. Documented in Dockerfile CMD. Horizontal scale → Redis-backed swap; out of scope for v1.

## Anti-spoof is a hard requirement

`p(real) < ANTISPOOF_THRESHOLD (default 0.80)` → `status=spoof`, no DB write, no debounce update. **Runs before embedding** to fail fast. Threshold is env-overridable per restaurant lighting.

## Per-employee schedule

`employees.expected_arrival_time` (HH:MM) + `employees.min_work_hours_per_day` (REAL). The system **derives** "опоздание" and "ранний уход" on-read via `app/core/attendance_metrics.derive_day_metrics()`. **Never store derived metrics on attendance_events** — schedule edits propagate retroactively.

## License caveat — `buffalo_l` weights

InsightFace `buffalo_l` pretrained weights are **research-licensed**. Internal БЕК staff use is low exposure but documented. If commercial-license question is raised: fallback is MIT FaceNet retrain (see `~/.claude/plans/zesty-doodling-elephant.md` §Risks #2).

## FaceDet_ai reuse map

From `/Users/komrxn/Projects/FaceDet_ai`:
- ✅ Port `src/core/face_engine.py:135-178` (embed + FAISS search) → `backend/app/core/face_engine.py`. Replace JPEG-dir-hash cache with DB-backed rebuild.
- ✅ Pattern from `src/config.py` (thresholds + provider) → re-implement as pydantic-settings.
- ❌ Drop: `src/ui/visualizer.py`, OpenCV main loop, SORT tracker, FERPlus emotion engine, CSV logger.

## Coding conventions

- **Python**: 3.11, async-first FastAPI. Type-annotate every public function. Use `pydantic.BaseModel` / SQLAlchemy `Mapped[]` for all schemas — no dicts at boundaries.
- **TypeScript**: `strict: true`, no implicit any, `verbatimModuleSyntax`. Types from `lib/zod.ts` schemas (`z.infer<typeof X>`) — never define API types twice.
- **Russian strings**: never inline directly into JSX where they'll need polish — pipe through `ru()` from `lib/ru.ts`.
- **Motion**: never inline magic durations / springs in components — always reference `lib/motion.ts` tokens.
- **Tests**: pytest for backend (`backend/tests/`), Vitest for frontend (set up in M8).

## Build order (mirror plan §Build order)

M0 (setup) → M1 (recognize) → M2 (CRUD) → M3 (admin enrollment) → M4 (kiosk + FSM) → M5 (anti-spoof) → M6 (dashboard) → M7 (Excel) → M8 (polish + Docker).

Each milestone is **runnable and demo-able**. Don't move on until the milestone's verification passes.

## Operational pitfalls — read before each milestone

### CWD convention

`backend/app/config.py` pins `.env` to the **repo root** via `Path(__file__).parents[2] / ".env"` — robust to CWD. Run uvicorn from `backend/`:
```
cd /Users/komrxn/Projects/BEK_FaceID/backend && .venv/bin/uvicorn app.main:app --reload
```
(`--reload` implies a single worker, which is what we want; see "Single-worker constraint" above.) The Dockerfile pins `WORKDIR /app` (= the backend tree) and bind-mounts `.env` at `/.env` so the same `parents[2]` lookup works.

### Timezone

`event_ts` is stored as UTC (SQLite's `datetime('now')`). `expected_arrival_time` is naive HH:MM in restaurant-local time (`Asia/Tashkent`). `derive_day_metrics()` (M6) must compose these in `RESTAURANT_TZ` — never use the server's local time.

### Cross-midnight shifts (M6 concern)

Kitchen/bar staff often arrive at 22:00 and leave at 04:00 → two SQL dates. M6's `derive_day_metrics` must use a "shift day" boundary at `SHIFT_DAY_CUTOFF_HOUR=4` (default), so events between 00:00 and 04:00 count toward the *previous* calendar day. Tested explicitly with a fixture cooking shift.

### Photo filename strategy (M2)

`employees.photo_path` and `face_embeddings.source_photo_path` store relative paths under `data/employee_photos/{employee_id}/{uuid4}.jpg`. UUID4 — no PII in filenames, collision-safe, easy GC. Resize originals to max 1024 px on upload.

### M1 envelope is minimal — don't over-stub

For M1, `/api/recognize` returns ONLY `{status, employee, confidence}`. `pending_event_token`, `last_event_today`, `can_mark_attendance`, `anti_spoof_score` are added in M4/M5 alongside the companion `/api/attendance/mark`. Stubbing them in M1 would obscure verification.
