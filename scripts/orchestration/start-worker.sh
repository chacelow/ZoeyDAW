#!/usr/bin/env bash
# Start one slice worker in a new child worktree of gpuix-migration, on a pinned omp model.
#
# Model: every worker runs on $WORKER_MODEL, never on whatever the global omp default happens to be
# (another session may change ~/.omp/agent/config.yml). `worker-start --agent omp --model` is
# rejected by Orca ("omp does not support launch-time model selection"), so the worker is started in
# three steps: create the worktree, open a terminal running `omp --model …` with Orca's status
# extension, then hand the spec to that terminal with `worker-start --terminal`.
# Usage: start-worker.sh <worktree-name> <task-title> <spec-file>...
set -euo pipefail
name="$1"; title="$2"; shift 2
WORKER_MODEL=cursor-claude/cx/gpt-6.1-sol
root=/Users/caishilong/orca/workspaces/zoeydaw
orca_omp="/Users/caishilong/Library/Application Support/orca/omp-managed-status-extension/fresh-session.yml"
spec=$(cat "$@")

field() { python3 -c '
import sys,json
d=json.loads(sys.stdin.read())
if not d.get("ok"): sys.exit("error: " + (d.get("error") or {}).get("message","")[:300])
r=d.get("result",{})
for path in sys.argv[1:]:
    v=r
    for k in path.split("."): v=(v or {}).get(k) if isinstance(v,dict) else None
    if v: print(v); break
' "$@"; }

created=$(orca worktree create --name "$name" --repo path:/Volumes/PSSD/code/zoeydaw --base-branch gpuix-migration \
  --setup skip --parent-worktree "path:$root/gpuix-migration" --json)
printf '%s' "$created" | field worktree.path path >/dev/null
# worktree create opens an idle shell; the worker gets its own omp terminal below.
startup=$(printf '%s' "$created" | field startupTerminal.handle || true)
[ -n "$startup" ] && orca terminal close --terminal "$startup" --tab --json >/dev/null

terminal=$(orca terminal create --worktree "path:$root/$name" --title "$name" \
  --command "omp --model $WORKER_MODEL --extension $HOME/.omp/agent/extensions/orca-agent-status.ts --config '$orca_omp'" \
  --json | field terminal.handle handle)
orca terminal wait --terminal "$terminal" --for tui-idle --timeout-ms 60000 --json >/dev/null 2>&1 || true

dispatch=$(orca orchestration worker-start --run run_2ea0f3afbca8 --spec "$spec" --task-title "$title" \
  --terminal "$terminal" --worktree "path:$root/$name" --json | field dispatchId dispatch.id)
echo "$name ok $dispatch model=$WORKER_MODEL terminal=$terminal"
