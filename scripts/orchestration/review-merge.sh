#!/usr/bin/env bash
# Coordinator merge review: merge <sha> onto the current branch in a throwaway worktree and run the
# lightweight local gate there (the full verify:gpuix runs on GitHub Actions after the push to main;
# this machine is too slow for it on every merge). Then run the given mutation entries (paths
# relative to apps/gpuix). Leaves the real branch untouched; prints the gate's exit status.
# Set FULL=1 to run the full verify:gpuix locally instead (use when diagnosing a red CI run).
# Usage: review-merge.sh <sha> [mutation-entry ...]
set -uo pipefail
sha="$1"; shift
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
base=$(git -C "$root" rev-parse HEAD)
tree=$(mktemp -d -t zoeydaw-review)
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
for config in "$tree"/scripts/gpuix-main/*/tsconfig.json; do
  [ -f "$config" ] && ln -sfn "$tree/apps/gpuix/node_modules" "$(dirname "$config")/node_modules"
done

cd "$tree" || exit 1
status=0
gate() { printf '\n== %s\n' "$1"; shift; "$@" || status=1; }
changed=$(git diff --name-only --diff-filter=d HEAD~1)
sources=$(printf '%s\n' "$changed" | grep -E '^apps/gpuix/src/.*\.tsx?$' | sed 's#^apps/gpuix/##' || true)
test_dirs=$(printf '%s\n' "$sources" | xargs -r -n1 dirname | sort -u | while read -r dir; do
  compgen -G "apps/gpuix/$dir/*.test.ts*" >/dev/null && echo "$dir"; done)
if [ "${FULL:-0}" = 1 ]; then
  bash scripts/verify-gpuix.sh HEAD~1 2>&1 | grep -E "^== |errors|^ok|pass$|fail$|todo$|Tests |hard|current|passed|exited|error|WARN|HARD"
  status=${PIPESTATUS[0]}
else
  gate "absolute paths" node scripts/gpuix-review-scan.mjs --absolute-paths
  gate "tsc --noEmit" bash -c 'cd apps/gpuix && pnpm exec tsc --noEmit && echo "0 errors"'
  [ -n "$sources" ] && gate "eslint (changed files)" bash -c "cd apps/gpuix && pnpm exec eslint --max-warnings=0 $(echo $sources)"
  [ -n "$test_dirs" ] && gate "bun test (changed directories)" bash -c "cd apps/gpuix && bun test $(echo $test_dirs | sed 's#\([^ ]*\)#./\1#g') 2>&1 | grep -E '^ [0-9]+ (pass|fail|todo)|\(fail\)'; exit \${PIPESTATUS[0]}"
  gate "review scan (HEAD~1...HEAD)" bash -c 'node scripts/gpuix-review-scan.mjs HEAD~1 | tail -3'
fi
echo "gate exit=$status"
for entry in "$@"; do
  echo "== mutations $entry"
  (cd apps/gpuix && bun $entry 2>&1 | grep -iE "caught|survived|SURVIV|KILLED|baseline|^\| [A-Za-z0-9]|: 0 failing|escaped|error" | tail -40)
done
[ -z "$(git status --short apps/gpuix/src)" ] || { echo "mutation left source changes"; status=3; }
exit "$status"
