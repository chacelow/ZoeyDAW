#!/usr/bin/env bash
set -euo pipefail
base="${1:-gpuix-migration}"
root="$(git rev-parse --show-toplevel)"
cd "$root"
logs="$(mktemp -d)"
trap 'rm -rf "$logs"' EXIT

step() { printf '\n== %s\n' "$1"; }

step "absolute paths (all Git-tracked executable sources)"
node scripts/gpuix-review-scan.mjs --absolute-paths

step "renderer identity (configured patch series, single native/React resolution)"
node scripts/gpuix-main/check.mjs --resolution | tail -1

step "@zoeydaw/native build"
pnpm native:build >"$logs/native.log" 2>&1 || { cat "$logs/native.log"; exit 1; }
echo "ok"

step "tsc --noEmit"
(cd apps/gpuix && pnpm exec tsc --noEmit)
echo "0 errors"

step "eslint apps/gpuix/src (layers, imports, max-warnings 0)"
pnpm exec eslint --max-warnings=0 apps/gpuix/src
echo "ok"

step "gpuix architecture rule regressions"
pnpm test:architecture

step "tooling CLI regressions (identity, link-only, staged UI map, review and commit gates)"
node --test scripts/gpuix-main/*.test.mjs scripts/verification/*.test.mjs

step "required documentation routes"
node scripts/check-doc-routes.mjs

step "bun test"
tests="$logs/tests.txt"
status=0
(cd apps/gpuix && bun test) >"$tests" 2>&1 || status=$?
grep -E "^ [0-9]+ (pass|fail|todo)|^Ran |\(fail\)" "$tests" || true
if [ "$status" -ne 0 ]; then
  cat "$tests"
  rm -f "$tests"
  echo "bun test exited $status"
  exit 1
fi
rm -f "$tests"

step "offscreen test-window bounds and backing scale (independent of display)"
bun test scripts/gpuix-main/test-window/test-window.test.tsx >"$logs/test-window.log" 2>&1 || { cat "$logs/test-window.log"; exit 1; }
echo "ok"

step "review scan ($base...HEAD; uncommitted changes are not scanned)"
node scripts/gpuix-review-scan.mjs "$base" | tail -3

step "UI map current (docs/architecture/gpuix-ui-map.md)"
node scripts/gpuix-ui-map.mjs --check

step "offscreen app smoke (real backend, Home -> project -> resume first present)"
evidence="$logs/smoke"
mkdir -p "$evidence"
(cd apps/gpuix && B2_EVIDENCE_DIR="$evidence" bun --preload ./src/app/verification/native-fixture.ts src/app/verification/resume-smoke.tsx) | tail -2

printf '\nverify:gpuix passed\n'
