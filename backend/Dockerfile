# BEK_FaceID backend — CUDA 12.2 runtime + Python 3.11 + InsightFace + ONNX-GPU.
#
# Build:
#   docker build -t bek-faceid-backend ./backend
# Run (GPU passthrough handled by docker-compose):
#   docker run --gpus all -p 8000:8000 -v ./data:/data bek-faceid-backend
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Python 3.11 + build tooling for insightface's Cython wheels + libgl for opencv-python-headless's runtime deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-venv python3.11-dev python3-pip \
        build-essential git \
        libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python3

WORKDIR /app

# Install Python deps first so app code changes don't bust the layer cache.
COPY backend/requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

# Copy app
COPY backend/ /app/
COPY scripts/ /scripts/

# Runtime defaults — overridden by docker-compose / .env
ENV EXECUTION_PROVIDERS="CUDAExecutionProvider,CPUExecutionProvider" \
    DB_URL="sqlite+aiosqlite:////data/bek.db" \
    MODELS_DIR="/models" \
    DATA_DIR="/data"

EXPOSE 8000

# Entrypoint: run alembic migrations idempotently, then start uvicorn.
# This makes the container self-sufficient — no manual migration step on a fresh DB.
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Single worker — see CLAUDE.md §Single-worker constraint (in-process debounce).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
