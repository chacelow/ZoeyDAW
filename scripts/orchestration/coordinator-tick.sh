#!/usr/bin/env bash
# launchd tick (every 10 min, ~/Library/LaunchAgents/com.zoeydaw.coordinator-tick.plist).
# 1. Runs health-check.sh. A worker gets a prompt typed into its terminal (at most once per
#    10 min per worker) when it is:
#    - IDLE: its turn ended (TUI idle) but the dispatch is still open. The worker cannot report
#      from that state, so the prompt makes it report to the coordinator through Orca.
#    - STALE: no session message for 10 min; ERROR: last message is an assistant error.
#    ASKING workers are not nudged: they wait on the coordinator's reply.
# 2. Types a patrol prompt into the coordinator terminal when it is idle, naming unanswered questions.
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
DIR=/Users/caishilong/orca/workspaces/zoeydaw/gpuix-migration/scripts/orchestration
COORD="term_abc5c16c-c9a2-4e3e-8e4e-6c98a70ec114"
LOG="$HOME/Library/Logs/zoeydaw-coordinator-tick.log"
STAMP="$HOME/Library/Caches/zoeydaw-tick"
mkdir -p "$STAMP"
ts() { date -u +%FT%TZ; }

report=$("$DIR/health-check.sh" 2>&1)
echo "$(ts) ---" >> "$LOG"
printf "%s\n" "$report" >> "$LOG"

printf "%s\n" "$report" | grep -E "^(IDLE|STALE|ERROR) " | while read -r flag id wt _rest; do
  handle=$(printf "%s\n" "$_rest" | grep -oE "term_[0-9a-f-]+" | tail -1)
  [ -n "$handle" ] || continue
  last="$STAMP/$id"
  if [ -f "$last" ] && [ $(( $(date +%s) - $(stat -f %m "$last") )) -lt 600 ]; then
    echo "$(ts) $id $flag nudge suppressed (<10m)" >> "$LOG"; continue
  fi
  case "$flag" in
    IDLE) text="[协调者巡检] 你的回合已结束,但派发仍未关闭,协调者收不到你的状态。现在二选一并立即执行:① 还有能独立推进的 TODO → 直接继续做;② 在等协调者/其它切片/桌面时段 → 用 orca orchestration ask 发出具体问题或申请(ask 会阻塞到协调者 reply,不要只在终端里写)。已完成 → 发 merge_ready 或 worker_done。不要停在没有发出消息的状态。" ;;
    *) text="[协调者巡检] 你的会话已 ${flag} (超过 10 分钟没有新消息,或最后一条是错误)。遇到模型流超时直接重试并从上一个 TODO 继续;在等协调者就用 orca orchestration ask 重发问题。" ;;
  esac
  orca terminal send --terminal "$handle" --enter --text "$text" >> "$LOG" 2>&1
  touch "$last"
  echo "$(ts) $id $flag nudged $handle" >> "$LOG"
done

if orca terminal wait --terminal "$COORD" --for tui-idle --timeout-ms 1000 >/dev/null 2>&1; then
  summary=$(printf "%s\n" "$report" | grep -cE "^(IDLE|STALE|ERROR) ")
  asks=$(printf "%s\n" "$report" | grep -oE "asks=[^ )]+" | sed 's/asks=//' | tr ',\n' '  ' | xargs)
  orca terminal send --terminal "$COORD" --enter --text "[定时巡检] 待你 reply 的 question: ${asks:-无}。有 ${summary} 个 worker 为 IDLE/STALE/ERROR(已自动唤醒)。运行 scripts/orchestration/health-check.sh 复核;清理已合入的 worktree、已结束的终端与超时 demo 进程;处理积压的 orchestration 消息后继续监听。" >> "$LOG" 2>&1
  echo "$(ts) coordinator pinged" >> "$LOG"
else
  echo "$(ts) coordinator busy, ping skipped" >> "$LOG"
fi
