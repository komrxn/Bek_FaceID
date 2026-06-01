# BEK_FaceID

Система учёта посещаемости сотрудников ресторана **БЕК** по распознаванию лиц.

Планшет у входа → Chrome в kiosk-режиме → локальный Linux-сервер с NVIDIA GPU в LAN → распознавание лица → отметка «Пришёл» / «Ушёл» → ежемесячный табель в Excel для бухгалтера.

---

## Возможности

- **Распознавание лица** — InsightFace `buffalo_l` (RetinaFace + ArcFace 512-d) на GPU.
- **Защита от подделки** — Silent-Face anti-spoofing рубит фото с телефона.
- **Server-side debounce** — нужно ≥3 совпадения подряд за 1.5 сек, чтобы отметка засчиталась.
- **Pending-token flow** — нельзя отметить кого-то «вручную» через curl: токен живёт 15 сек и одноразовый.
- **Admin-панель** — добавление сотрудников с фото + расписанием, дашборд посещаемости, экспорт табеля.
- **Per-employee расписание** — у каждого сотрудника своё «время прихода» и «минимум часов в день». Опоздания и ранние уходы вычисляются автоматически.
- **Корпоративный UI** — Inter, slate/indigo/green/red палитра, Framer Motion, kiosk в тёмной теме.

---

## Стек

| Слой | Что используется |
|---|---|
| Распознавание | InsightFace `buffalo_l` (ONNX) + FAISS `IndexFlatIP` |
| Anti-spoof | minivision-ai Silent-Face (MiniFASNetV1SE + V2, ONNX) |
| Backend | FastAPI + Uvicorn (`--workers 1`) + SQLAlchemy 2.0 + aiosqlite + Alembic + openpyxl + bcrypt + itsdangerous |
| База данных | SQLite (WAL) |
| Frontend | React 18 + Vite + TypeScript + Tailwind + Framer Motion + React Router 6 + TanStack Query + react-hook-form + Zod |
| Деплой | docker-compose, backend на CUDA 12.2 + nvidia-container-toolkit, frontend на nginx |

---

## Развёртывание

### 1. Зависимости хоста

- Linux (Ubuntu 22.04+) с NVIDIA GPU.
- Docker + `nvidia-container-toolkit`:
  ```bash
  sudo apt install nvidia-container-toolkit
  sudo systemctl restart docker
  ```

### 2. Подготовка моделей (один раз)

```bash
cp .env.example .env
# Отредактируйте .env — обязательно задайте SESSION_SECRET (32+ символа)

bash scripts/download_models.sh
```

Скрипт:
- Скачивает InsightFace `buffalo_l` (происходит автоматически при первом запуске бэка).
- Клонирует `minivision-ai/Silent-Face-Anti-Spoofing` в `models/_silentface_src/`.
- Конвертирует PyTorch `.pth` → ONNX (нужен `torch` только на этом шаге; runtime использует только onnxruntime).

### 3. Создание администратора

```bash
docker compose run --rm backend python /scripts/bootstrap_admin.py admin <strong-password>
```

### 4. Запуск

```bash
docker compose up -d --build
```

- **Kiosk**: `http://<IP-сервера>/` → запустить на планшете Chrome `--kiosk --use-fake-ui-for-media-stream http://<IP-сервера>/`.
- **Admin**: `http://<IP-сервера>/admin/login`.

---

## Локальная разработка (без Docker)

Бэк:
```bash
cd backend
python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp ../.env.example ../.env  # отредактируйте под Mac (CoreMLExecutionProvider) или CPU
.venv/bin/alembic upgrade head
python /Users/komrxn/Projects/BEK_FaceID/scripts/bootstrap_admin.py admin bek2026admin
.venv/bin/uvicorn app.main:app --reload
```

Фронт:
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173 — Vite проксирует /api на бэк :8000
```

---

## Документация для будущего

- **План реализации**: `~/.claude/plans/zesty-doodling-elephant.md`
- **Соглашения проекта** (стек, threshold'ы, поведение FAISS, тёмная/светлая темы): [`CLAUDE.md`](./CLAUDE.md)
- **Реестр критичных файлов**: см. план §"Critical files to author"
- **Reuse-карта vs FaceDet_ai**: `~/.claude/projects/-Users-komrxn-Projects-BEK-FaceID/memory/reference_facedet_ai.md`

---

## Лицензионная заметка

Предобученные веса InsightFace `buffalo_l` распространяются под research-лицензией. Внутреннее использование в ресторане для учёта собственного персонала — низкий правовой риск, но для коммерческого распространения требуется отдельная лицензия InsightFace.
