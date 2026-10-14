#!/usr/bin/env bash
set -euo pipefail

readonly revision=6a5c7c142ac32f9eb0caefe0121be995cfc18631
readonly zed_revision=c2e9f882030ca95cee55d206512a0a3ee6cd72b0
readonly vendor=/Volumes/PSSD/code/_vendor/gpuix
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/Volumes/PSSD/code/_vendor/target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-6}"

case "$CARGO_TARGET_DIR" in
  /Volumes/PSSD/*) ;;
  *) echo "CARGO_TARGET_DIR must stay on /Volumes/PSSD" >&2; exit 1 ;;
esac
case "$CARGO_BUILD_JOBS" in
  [1-6]) ;;
  *) echo "CARGO_BUILD_JOBS must be between 1 and 6" >&2; exit 1 ;;
esac
case "${1:-runtime}" in
  runtime) features=test-support,gpui_platform/runtime_shaders ;;
  precompiled) features=test-support; xcrun --find metal ;;
  *) echo "Usage: bash scripts/gpuix-main/build.sh [runtime|precompiled]" >&2; exit 1 ;;
esac

if [ ! -d "$vendor/.git" ]; then
  mkdir -p /Volumes/PSSD/code/_vendor
  git clone --filter=blob:none https://github.com/remorses/gpuix.git "$vendor"
  git -C "$vendor" checkout --detach "$revision"
fi
[ "$(git -C "$vendor" rev-parse HEAD)" = "$revision" ] || {
  echo "Refusing to build a different gpuix revision" >&2; exit 1;
}
git -C "$vendor" submodule update --init --depth 1
[ "$(git -C "$vendor/zed" rev-parse HEAD)" = "$zed_revision" ]
# The spike patch may be present locally; make that visible rather than discard it.
git -C "$vendor" diff --stat
git -C "$vendor/zed" diff --stat
mkdir -p "$CARGO_TARGET_DIR"
pushd "$vendor" >/dev/null
bun install --frozen-lockfile
popd >/dev/null
pushd "$vendor/packages/native" >/dev/null
rustc -vV
/usr/bin/time -l bunx napi build --platform --esm --js index.js --release --features "$features" 2>&1 | tee /Volumes/PSSD/code/_vendor/build-reproduce.log
bun run build:js
stat -f '%z bytes' gpuix-native.darwin-arm64.node
popd >/dev/null
pushd "$vendor/packages/react" >/dev/null
bun run build
popd >/dev/null
du -sk "$CARGO_TARGET_DIR"
