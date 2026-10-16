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
# Paths come from this checkout: the coordinator worktree, its sibling workspace directory, and
# the main repository behind the shared git dir. Nothing is hard-coded to one machine.
coordinator=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
root=$(dirname "$coordinator")
repository=$(dirname "$(git -C "$coordinator" rev-parse --path-format=absolute --git-common-dir)")
orca_omp="$HOME/Library/Application Support/orca/omp-managed-status-extension/fresh-session.yml"
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

created=$(orca worktree create --name "$name" --repo "path:$repository" --base-branch gpuix-migration \
  --setup skip --parent-worktree "path:$coordinator" --json)
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
# worker-start can leave the pasted brief sitting in the input box when omp is still loading MCP
# servers; an unsubmitted brief idles forever. If the agent is idle afterwards, press Enter once.
sleep 15
if orca terminal wait --terminal "$terminal" --for tui-idle --timeout-ms 1000 --json >/dev/null 2>&1; then
  orca terminal send --terminal "$terminal" --enter --text "" --json >/dev/null
fi
echo "$name ok $dispatch model=$WORKER_MODEL terminal=$terminal"
