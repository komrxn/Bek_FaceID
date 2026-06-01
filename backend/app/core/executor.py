"""Single-thread executor that serializes all GPU/CUDA work.

Why single thread:
  - InsightFace + onnxruntime share one CUDA stream per process. Multiple Python
    threads contending for that stream can produce non-deterministic device
    errors. A 1-thread pool keeps the stream serialized while still freeing
    the asyncio event loop from blocking calls.
  - The Silent-Face anti-spoof (M5) reuses this same executor.
  - The debounce (M4) is in-process state; running >1 worker would split it.
    See CLAUDE.md §Single-worker constraint.

Used by every API handler that touches the model:

    result = await loop.run_in_executor(get_executor(), blocking_pipeline, frame)
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache


@lru_cache
def get_executor() -> ThreadPoolExecutor:
    """Process-wide single-thread executor for all GPU calls."""
    return ThreadPoolExecutor(max_workers=1, thread_name_prefix="bek-gpu")
