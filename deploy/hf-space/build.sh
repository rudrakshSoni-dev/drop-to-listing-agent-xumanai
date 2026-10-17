#!/usr/bin/env bash
# Assemble the Hugging Face Space folder from this repo: deploy/hf-space/out/
# Then: cd deploy/hf-space/out && git init && git remote add origin <space git url> && git add -A && git commit -m deploy && git push -f origin main
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/out"

rm -rf "$OUT"
mkdir -p "$OUT/evals"
cp -r "$ROOT/api/app" "$ROOT/api/pipeline" "$ROOT/api/prompts" "$ROOT/api/seed" "$OUT/"
cp "$ROOT/api/requirements.txt" "$HERE/Dockerfile" "$HERE/README.md" "$OUT/"
cp "$ROOT/evals/results.json" "$ROOT/evals/notes.md" "$OUT/evals/"
find "$OUT" -name __pycache__ -type d -prune -exec rm -rf {} +
echo "Space folder ready: $OUT ($(du -sh "$OUT" | cut -f1))"
