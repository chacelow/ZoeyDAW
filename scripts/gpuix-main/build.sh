#!/usr/bin/env bash
set -euo pipefail

readonly script_dir="$(cd "$(dirname "$0")" && pwd)"
readonly root="$(cd "$script_dir/../.." && pwd)"
readonly revision="$(node -p "require('$script_dir/config.json').revision")"
readonly zed_revision="$(node -p "require('$script_dir/config.json').zedRevision")"
readonly vendor_root="${GPUIX_VENDOR_ROOT:-/Volumes/PSSD/code/_vendor/zoeydaw-gpuix}"
readonly vendor="$vendor_root/$revision"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/Volumes/PSSD/code/_vendor/target}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-6}"

# Local builds keep the large target on the external disk; hosted CI runners have no such volume.
case "$CARGO_TARGET_DIR" in
  /Volumes/PSSD/*) ;;
  *) [ "${CI:-}" = "true" ] || { echo "CARGO_TARGET_DIR must stay on /Volumes/PSSD" >&2; exit 1; } ;;
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

link_checkout() {
  if [ -e "$root/.gpuix-main" ] && [ ! -L "$root/.gpuix-main" ]; then
    echo "Refusing to replace a non-symlink .gpuix-main" >&2; exit 1
  fi
  ln -sfn "$vendor" "$root/.gpuix-main"
  for config in "$script_dir"/*/tsconfig.json; do
    [ -f "$config" ] || continue
    ln -sfn "$root/apps/gpuix/node_modules" "$(dirname "$config")/node_modules"
  done
}

if node "$script_dir/check.mjs" --vendor "$vendor" --build-mode "${1:-runtime}"; then
  link_checkout
  echo "Linked verified gpuix build without rebuilding or acquiring the build lock"
  exit 0
fi

mkdir -p "$vendor_root"
if ! mkdir "$vendor_root/.build-lock"; then
  echo "Another gpuix build owns $vendor_root/.build-lock; do not build concurrently" >&2
  echo "After an interrupted build, verify it has stopped before removing the empty lock directory" >&2
  exit 1
fi
trap 'rmdir "$vendor_root/.build-lock"' EXIT

if [ ! -d "$vendor/.git" ]; then
  git clone --filter=blob:none https://github.com/remorses/gpuix.git "$vendor"
  git -C "$vendor" checkout --detach "$revision"
fi
[ "$(git -C "$vendor" rev-parse HEAD)" = "$revision" ] || {
  echo "Refusing to build a different gpuix revision" >&2; exit 1;
}
git -C "$vendor" submodule update --init --depth 1
[ "$(git -C "$vendor/zed" rev-parse HEAD)" = "$zed_revision" ]
[ -z "$(git -C "$vendor" ls-files --others --exclude-standard)" ] || {
  echo "Refusing untracked gpuix sources" >&2; exit 1;
}
# Only extend a checkout that exactly matches a reviewed prefix of the series.
pending_patches="$(node "$script_dir/check.mjs" --pending "$vendor")"
readonly pending_patches
# Files a patch creates are recorded with `git add --intent-to-add`, so the next build's
# untracked-source guard does not mistake them for stray edits (context-menu.patch adds
# context_menu.rs). Not `git apply --intent-to-add`: Apple Git 2.50.1 drops every index entry the
# patch does not touch, which then reads as deleting the rest of the tree.
while IFS= read -r patch; do
  case "$patch" in
    "") ;;
    zed/*) git -C "$vendor/zed" apply "$script_dir/patches/${patch#zed/}" ;;
    *) git -C "$vendor" apply "$script_dir/patches/$patch" ;;
  esac
done <<< "$pending_patches"
for repository in "$vendor" "$vendor/zed"; do
  created="$(git -C "$repository" ls-files --others --exclude-standard)"
  [ -z "$created" ] || printf '%s\n' "$created" | git -C "$repository" add --intent-to-add --pathspec-from-file=-
done
# Both repositories must now match their full registered series, with no other edits.
node "$script_dir/check.mjs" --sources "$vendor"
mkdir -p "$CARGO_TARGET_DIR"
pushd "$vendor" >/dev/null
bun install --frozen-lockfile
popd >/dev/null
pushd "$vendor/packages/native" >/dev/null
rustc -vV
/usr/bin/time -l bunx napi build --platform --esm --js index.js --release --features "$features" 2>&1 | tee "$vendor_root/build-reproduce.log"
bun run build:js
stat -f '%z bytes' "gpuix-native.$(node -p 'process.platform + "-" + process.arch').node"
popd >/dev/null
pushd "$vendor/packages/react" >/dev/null
bun run build
popd >/dev/null
du -sk "$CARGO_TARGET_DIR"
link_checkout
node "$script_dir/check.mjs" --record --build-mode "${1:-runtime}"
