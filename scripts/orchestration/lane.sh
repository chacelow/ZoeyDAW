#!/usr/bin/env bash
# Reusable worker lanes: a fixed pool of worktrees, each with one long-lived omp agent terminal.
# A new task reuses an idle lane instead of creating a fresh worktree and agent, so the agent keeps
# what it already read (contracts, file map) and skips the expensive first exploration.
#
#   lane.sh list                          lanes, branch, dirty count, merged state, agent terminal
#   lane.sh assign <lane> <title> <spec>… reset an idle lane to a new branch off gpuix-migration and
#                                         dispatch the task to its existing agent terminal
#   lane.sh new <lane> <title> <spec>…    create a lane (worktree + agent) when every lane is busy
#
# A lane is a long-lived worktree plus its agent terminal. Any child worktree of gpuix-migration
# (sibling directory gpuix-*) qualifies, so existing slice worktrees become lanes as they are. Each
# task gets its own branch lane/<lane>/<slug> so merges and reviews still see one branch per task.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
coordinator=$(git -C "$here" rev-parse --show-toplevel)
root=$(dirname "$coordinator")
run=run_2ea0f3afbca8
base=gpuix-migration

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

# The live omp terminal of a worktree, if any (the agent, not the idle shell Orca opens).
agent_terminal() {
  orca terminal list --worktree "path:$1" --json \
    | jq -r '.result.terminals[]? | select((.title // "") | test("OMP|omp|π")) | .handle' | head -1
}

# Last dispatch of this terminal and its status.
last_dispatch() {
  orca orchestration worker-list --run "$run" --json \
    | jq -r --arg t "$1" '[.result.workers[] | select(.agentTerminalHandle==$t)] | last | "\(.dispatchId // "") \(.dispatchStatus // "")"'
}

slug() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//' | cut -c1-40; }

cmd=${1:-list}; shift || true
case "$cmd" in
list)
  git -C "$coordinator" fetch -q . "$base" 2>/dev/null || true
  for dir in "$root"/gpuix-*; do
    [ -d "$dir" ] && [ "$dir" != "$coordinator" ] || continue
    lane=$(basename "$dir")
    branch=$(git -C "$dir" branch --show-current)
    dirty=$(git -C "$dir" status --short | wc -l | tr -d ' ')
    merged=no; git -C "$dir" merge-base --is-ancestor HEAD "$base" && merged=yes
    terminal=$(agent_terminal "$dir")
    read -r dispatch status <<<"$( [ -n "$terminal" ] && last_dispatch "$terminal" || echo "- -")"
    echo "$lane branch=$branch dirty=$dirty merged=$merged terminal=${terminal:--} last=${dispatch:--}:${status:--}"
  done
  ;;
assign)
  lane=$1; title=$2; shift 2
  dir="$root/$lane"
  [ -d "$dir" ] || { echo "no lane $lane; use: lane.sh new $lane …" >&2; exit 1; }
  [ -z "$(git -C "$dir" status --porcelain)" ] || { echo "$lane has uncommitted changes" >&2; exit 1; }
  git -C "$dir" merge-base --is-ancestor HEAD "$base" \
    || { echo "$lane branch $(git -C "$dir" branch --show-current) is not merged into $base" >&2; exit 1; }
  terminal=$(agent_terminal "$dir")
  [ -n "$terminal" ] || { echo "$lane has no live agent terminal; use: lane.sh new" >&2; exit 1; }
  read -r dispatch status <<<"$(last_dispatch "$terminal")"
  case "$status" in completed|failed|stopped|abandoned|"") ;; *)
    echo "$lane is busy: $dispatch is $status" >&2; exit 1 ;;
  esac
  old=$(git -C "$dir" branch --show-current)
  # ASCII slug of the title plus a timestamp: CJK titles slug to almost nothing.
  new="lane/$lane/$(date -u +%m%d%H%M)-$(slug "$title")"
  git -C "$dir" switch -q -c "$new" "$base"
  # The previous task branch is merged (checked above); drop it so lanes do not accumulate refs.
  [ -n "$old" ] && [ "$old" != "$new" ] && git -C "$dir" branch -q -d "$old" 2>/dev/null || true
  # Dependencies and the renderer link follow the new base; both are no-ops when nothing changed.
  (cd "$dir" && bash scripts/gpuix-main/build.sh >/dev/null && pnpm install --frozen-lockfile --prefer-offline >/dev/null)
  spec=$(printf '本 lane 上一个任务已合入并结束。你现在在新分支 %s（基于 %s 最新提交）。之前读过的契约、文件地图可以继续用，但涉及的文件以当前分支内容为准；不要从上一个任务的分支继续改。\n\n' "$new" "$base"; cat "$@")
  dispatch=$(orca orchestration worker-start --run "$run" --spec "$spec" --task-title "$title" \
    --terminal "$terminal" --worktree "path:$dir" --json | field dispatchId dispatch.id)
  sleep 10
  if orca terminal wait --terminal "$terminal" --for tui-idle --timeout-ms 1000 --json >/dev/null 2>&1; then
    orca terminal send --terminal "$terminal" --enter --text "" --json >/dev/null
  fi
  orca worktree set --worktree "path:$dir" --comment "lane；当前任务：${title}（${dispatch}）" --json >/dev/null
  echo "$lane ok $dispatch branch=$new terminal=$terminal"
  ;;
new)
  lane=$1; shift
  bash "$here/start-worker.sh" "$lane" "$@"
  ;;
*)
  echo "usage: lane.sh list | assign <lane> <title> <spec>… | new <lane> <title> <spec>…" >&2; exit 2 ;;
esac
