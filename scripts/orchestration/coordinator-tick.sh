#!/usr/bin/env bash
# launchd tick (every 10 min).
# 1. Runs health-check.sh; any worker whose session's last message is older than 10 min (STALE)
#    or ended on an assistant error (ERROR) gets a resume prompt typed into its terminal,
#    at most once per 20 min per worker.
# 2. Types a patrol prompt into the coordinator terminal when it is idle.
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
DIR=/Users/caishilong/orca/workspaces/zoeydaw/gpuix-migration/scripts/orchestration
COORD="term_0fd151fe-e7bc-4de5-bb1a-476fa321d21d"
LOG="$HOME/Library/Logs/zoeydaw-coordinator-tick.log"
STAMP="$HOME/Library/Caches/zoeydaw-tick"
mkdir -p "$STAMP"
ts() { date -u +%FT%TZ; }

report=$("$DIR/health-check.sh" 2>&1)
echo "$(ts) ---" >> "$LOG"
printf "%s\n" "$report" >> "$LOG"

printf "%s\n" "$report" | grep -E "^(STALE|ERROR) " | while read -r flag id wt _rest; do
  handle=$(printf "%s\n" "$_rest" | grep -oE "term_[0-9a-f-]+" | tail -1)
  [ -n "$handle" ] || continue
  last="$STAMP/$id"
  if [ -f "$last" ] && [ $(( $(date +%s) - $(stat -f %m "$last") )) -lt 1200 ]; then
    echo "$(ts) $id $flag nudge suppressed (<20m)" >> "$LOG"; continue
  fi
  orca terminal send --terminal "$handle" --enter --text "[协调者巡检] 你的会话已 ${flag} (超过 10 分钟没有新消息,或最后一条是错误)。如果在等协调者答复,用 orchestration ask 重发问题;否则从上一个 TODO 继续,遇到模型流超时直接重试。" >> "$LOG" 2>&1
  touch "$last"
  echo "$(ts) $id $flag nudged $handle" >> "$LOG"
done

if orca terminal wait --terminal "$COORD" --for tui-idle --timeout-ms 1000 >/dev/null 2>&1; then
  summary=$(printf "%s\n" "$report" | grep -cE "^(STALE|ERROR) ")
  orca terminal send --terminal "$COORD" --enter --text "[定时巡检] 有 ${summary} 个 worker 为 STALE/ERROR(已自动唤醒)。运行 scripts/orchestration/health-check.sh 复核;清理已合入的 worktree、已结束的终端与超时 demo 进程;处理积压的 orchestration 消息后继续监听。" >> "$LOG" 2>&1
  echo "$(ts) coordinator pinged" >> "$LOG"
else
  echo "$(ts) coordinator busy, ping skipped" >> "$LOG"
fi
