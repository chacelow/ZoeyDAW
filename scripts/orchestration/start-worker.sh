#!/usr/bin/env bash
# Start one slice worker in a new child worktree and pin its Orca parent to gpuix-migration.
# `worker-start --worktree new-child` takes the parent from the coordinator terminal's worktree,
# which is the root repo checkout, so every child must be re-parented right after creation.
# Usage: start-worker.sh <worktree-name> <task-title> <spec-file>...
set -euo pipefail
name="$1"; title="$2"; shift 2
root=/Users/caishilong/orca/workspaces/zoeydaw
spec=$(cat "$@")
out=$(orca orchestration worker-start --run run_2ea0f3afbca8 --spec "$spec" --task-title "$title" \
  --worktree new-child --name "$name" --repo path:/Volumes/PSSD/code/zoeydaw \
  --base-branch gpuix-migration --agent omp --setup skip --json)
printf '%s\n' "$out" | python3 -c '
import sys,json
d=json.loads(sys.stdin.read()); r=d.get("result",{})
print(sys.argv[1], "ok" if d.get("ok") else d.get("error",{}).get("message","")[:300],
      r.get("dispatchId") or (r.get("dispatch") or {}).get("id"))' "$name"
orca worktree set --worktree "path:$root/$name" --parent-worktree "path:$root/gpuix-migration" --json >/dev/null
echo "$name parent -> gpuix-migration"
