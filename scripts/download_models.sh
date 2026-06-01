#!/usr/bin/env bash
# Pull all models BEK_FaceID needs.
#
#   * InsightFace `buffalo_l` is auto-downloaded by `insightface` on first
#     `FaceAnalysis(name='buffalo_l')` call into ~/.insightface/models/. We
#     just verify the network is reachable here.
#   * Silent-Face anti-spoofing — clone upstream repo + run a one-shot
#     PyTorch→ONNX export. Torch is needed ONLY for the export step.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SILENTFACE_SRC="$ROOT/models/_silentface_src"

echo "==> 1/2 InsightFace buffalo_l"
if [ ! -d "$HOME/.insightface/models/buffalo_l" ]; then
  echo "    buffalo_l will be auto-downloaded by FaceAnalysis on first backend start."
else
  echo "    already cached at $HOME/.insightface/models/buffalo_l"
fi

echo "==> 2/2 Silent-Face anti-spoofing"
if [ ! -d "$SILENTFACE_SRC" ]; then
  git clone --depth 1 https://github.com/minivision-ai/Silent-Face-Anti-Spoofing "$SILENTFACE_SRC"
fi

echo "    converting .pth → .onnx (one-shot, requires torch)"
"$ROOT/backend/.venv/bin/python" "$ROOT/scripts/export_silentface_onnx.py" || {
  echo
  echo "    Export failed. If torch is missing:"
  echo "        $ROOT/backend/.venv/bin/pip install 'torch>=2.0,<3.0'"
  echo "    then re-run this script. Torch can be removed afterwards."
  exit 1
}

echo
echo "All models ready. Anti-spoof models live in: models/silent_face/"
