#!/usr/bin/env bash
# Assemble the Hugging Face Gradio Space folder from this repo: deploy/hf-gradio/out/
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/out"

rm -rf "$OUT"
mkdir -p "$OUT/evals"

echo "Copying application modules..."
cp -r "$ROOT/api/app" "$ROOT/api/pipeline" "$ROOT/api/prompts" "$ROOT/api/seed" "$OUT/"
cp "$HERE/app.py" "$HERE/packages.txt" "$HERE/requirements.txt" "$HERE/README.md" "$OUT/"
cp "$ROOT/evals/results.json" "$ROOT/evals/notes.md" "$OUT/evals/"

# Strip any __pycache__ directories
find "$OUT" -name __pycache__ -type d -prune -exec rm -rf {} +

echo "✅ Gradio Space folder ready: $OUT ($(du -sh "$OUT" | cut -f1))"
