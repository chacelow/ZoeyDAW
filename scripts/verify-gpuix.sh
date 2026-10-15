#!/usr/bin/env bash
# One gate for gpuix changes; run from the checkout root (slice worktree or coordinator merge tree).
# Usage: bash scripts/verify-gpuix.sh [baseRef]   (baseRef defaults to gpuix-migration; scan diffs base...HEAD)
# Order is cheapest-first and stops on the first failure. Every step prints one result line.
set -euo pipefail
base="${1:-gpuix-migration}"
root="$(git rev-parse --show-toplevel)"
cd "$root"

step() { printf '\n== %s\n' "$1"; }

step "renderer identity (configured patch series, single native/React resolution)"
node scripts/gpuix-main/check.mjs --resolution | tail -1

step "@zoeydaw/native build"
pnpm native:build >/tmp/verify-gpuix-native.$$.log 2>&1 || { cat /tmp/verify-gpuix-native.$$.log; exit 1; }
rm -f /tmp/verify-gpuix-native.$$.log
echo "ok"

step "tsc --noEmit"
# `a && b` is exempt from `set -e`, so each gate is a plain statement whose failure stops the script.
(cd apps/gpuix && pnpm exec tsc --noEmit)
echo "0 errors"

step "eslint apps/gpuix/src (layers, imports, max-warnings 0)"
pnpm exec eslint --max-warnings=0 apps/gpuix/src
echo "ok"

step "gpuix architecture rule regressions"
pnpm test:architecture

step "required documentation routes"
node scripts/check-doc-routes.mjs

step "bun test"
tests="/tmp/verify-gpuix-test.$$.txt"
status=0
(cd apps/gpuix && bun test) >"$tests" 2>&1 || status=$?
grep -E "^ [0-9]+ (pass|fail|todo)|^Ran |\(fail\)" "$tests" || true
if [ "$status" -ne 0 ]; then
  tail -40 "$tests"
  rm -f "$tests"
  echo "bun test exited $status"
  exit 1
fi
rm -f "$tests"

step "review scan ($base...HEAD; uncommitted changes are not scanned)"
node scripts/gpuix-review-scan.mjs "$base" | tail -3

step "UI map current (docs/architecture/gpuix-ui-map.md)"
node scripts/gpuix-ui-map.mjs --check

step "offscreen app smoke (real backend, Home -> project -> resume first present)"
evidence="$(mktemp -d)"
trap 'rm -rf "$evidence"' EXIT
(cd apps/gpuix && B2_EVIDENCE_DIR="$evidence" bun --preload ./src/app/verification/native-fixture.ts src/app/verification/resume-smoke.tsx) | tail -2

printf '\nverify:gpuix passed\n'
