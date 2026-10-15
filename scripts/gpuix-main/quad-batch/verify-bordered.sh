#!/usr/bin/env bash
set -euo pipefail
readonly here="$(cd "$(dirname "$0")" && pwd)"
readonly output="${1:?Usage: verify-bordered.sh OUTPUT_DIRECTORY [CONSUMER_GEOMETRY_JSON]}"
bun "$here/bordered-pixel-parity.tsx" "$output/paint"
for name in opaque alpha opacity zero-stroke; do
  python3 "$here/compare-pixels.py" "$output/paint/$name-quad.png" "$output/paint/$name-div.png"
done
if [ -n "${2:-}" ]; then
  bun "$here/midi-geometry-oracle.tsx" "$2" "$output/development"
  NODE_ENV=production bun "$here/midi-geometry-oracle.tsx" "$2" "$output/production"
  for mode in development production; do
    python3 "$here/compare-pixels.py" "$output/$mode/midi-stroke.png" "$output/$mode/midi-div.png"
  done
fi
