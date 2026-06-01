#!/usr/bin/env python3
"""One-shot conversion of Silent-Face-Anti-Spoofing .pth → .onnx.

Run once on install (or when the upstream weights change). The runtime
backend uses `onnxruntime-gpu` only — torch is required only during this
conversion, then discarded.

Expects the upstream repo cloned at `models/_silentface_src/`:
    git clone https://github.com/minivision-ai/Silent-Face-Anti-Spoofing models/_silentface_src

Outputs to `models/silent_face/*.onnx`.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "models" / "_silentface_src"
OUT_DIR = ROOT / "models" / "silent_face"

PTH_FILES = [
    ("2.7_80x80_MiniFASNetV2.pth", "2.7_80x80_MiniFASNetV2.onnx"),
    ("4_0_0_80x80_MiniFASNetV1SE.pth", "4_0_0_80x80_MiniFASNetV1SE.onnx"),
]


def main() -> int:
    try:
        import torch  # noqa: F401
    except ImportError:
        sys.stderr.write(
            "torch is required for ONNX export.\n"
            "  pip install 'torch>=2.0,<3.0'\n"
            "Run this script once, then uninstall torch — runtime uses onnxruntime only.\n"
        )
        return 2

    if not SRC_DIR.exists():
        sys.stderr.write(
            f"Silent-Face repo not found at {SRC_DIR}.\n"
            f"  git clone https://github.com/minivision-ai/Silent-Face-Anti-Spoofing {SRC_DIR}\n"
        )
        return 3

    sys.path.insert(0, str(SRC_DIR))
    try:
        from src.model_lib.MiniFASNet import (  # type: ignore[import-not-found]
            MiniFASNetV2,
            MiniFASNetV1SE,
        )
    except ImportError as exc:
        sys.stderr.write(f"failed to import MiniFASNet from upstream: {exc}\n")
        return 4

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pth_root = SRC_DIR / "resources" / "anti_spoof_models"

    for pth_name, onnx_name in PTH_FILES:
        pth_path = pth_root / pth_name
        out_path = OUT_DIR / onnx_name
        if not pth_path.exists():
            sys.stderr.write(f"[skip] missing {pth_path}\n")
            continue

        if "V2" in pth_name:
            net = MiniFASNetV2(embedding_size=128, conv6_kernel=(5, 5), drop_p=0.0)
        else:
            net = MiniFASNetV1SE(embedding_size=128, conv6_kernel=(5, 5), drop_p=0.0)

        state = __import__("torch").load(pth_path, map_location="cpu")
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        # Strip 'module.' prefix from DataParallel-saved weights.
        state = {k.replace("module.", "", 1): v for k, v in state.items()}
        net.load_state_dict(state)
        net.eval()

        dummy = __import__("torch").randn(1, 3, 80, 80, dtype=__import__("torch").float32)
        __import__("torch").onnx.export(
            net,
            dummy,
            str(out_path),
            input_names=["input"],
            output_names=["output"],
            opset_version=13,
            dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        )
        print(f"[export] {pth_name} → {out_path.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
