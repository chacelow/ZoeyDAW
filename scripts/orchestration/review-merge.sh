#!/usr/bin/env bash
# Coordinator merge review: merge <sha> onto the current branch in a throwaway worktree, run the full
# verify:gpuix gate there, then run the given mutation entries (paths relative to apps/gpuix).
# Leaves the real branch untouched; prints the throwaway path and the gate's exit status.
# Usage: review-merge.sh <sha> [mutation-entry ...]
set -uo pipefail
sha="$1"; shift
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
base=$(git -C "$root" rev-parse HEAD)
tree=$(mktemp -d "${TMPDIR:-/tmp}/zoeydaw-review.XXXXXX")
trap 'git -C "$root" worktree remove --force "$tree" >/dev/null 2>&1' EXIT

echo "== merge $sha onto $(git -C "$root" rev-parse --short HEAD)"
git -C "$root" worktree add --detach "$tree" "$base" >/dev/null
git -C "$tree" merge --no-commit --no-ff "$sha" >/dev/null 2>&1
conflicts=$(git -C "$tree" diff --name-only --diff-filter=U)
if [ -n "$conflicts" ]; then echo "conflicts:"; echo "$conflicts"; exit 2; fi
git -C "$tree" -c user.name=review -c user.email=review@local commit -q --no-verify -m "review merge"
git -C "$tree" diff --stat HEAD~1 | tail -1

ln -s "$(readlink "$root/.gpuix-main")" "$tree/.gpuix-main"
ln -s "$root/node_modules" "$tree/node_modules"
for package in apps/gpuix crates/native; do cp -a "$root/$package/node_modules" "$tree/$package/node_modules"; done
cp "$root"/crates/native/{index.js,index.d.ts,*.node} "$tree/crates/native/" 2>/dev/null

cd "$tree" || exit 1
bash scripts/verify-gpuix.sh HEAD~1 2>&1 | grep -E "^== |errors|^ok|pass$|fail$|todo$|Tests |hard|current|passed|exited|error|WARN|HARD"
status=${PIPESTATUS[0]}
echo "verify exit=$status"
for entry in "$@"; do
  echo "== mutations $entry"
  (cd apps/gpuix && bun $entry 2>&1 | grep -iE "caught|survived|SURVIV|KILLED|baseline|^\| [A-Za-z0-9]|: 0 failing|escaped|error" | tail -40)
done
[ -z "$(git status --short apps/gpuix/src)" ] || { echo "mutation left source changes"; status=3; }
exit "$status"
