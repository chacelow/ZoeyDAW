#!/usr/bin/env bash
# Coordinator listener: blocks until worker messages arrive, prints them, exits.
# Orca allows one actionable waiter per run; an orphaned `check --wait` (its reader died)
# makes every later listener fail with waiter_exists, so any stale waiter is killed first.
# Usage: listen.sh [ack-delivery-id] [timeout-ms]
set -u
ack="${1:-}"; timeout="${2:-540000}"
cd /Users/caishilong/orca/workspaces/zoeydaw/gpuix-migration || exit 1
pkill -f "orchestration check --run run_2ea0f3afbca8 .*--wait" 2>/dev/null && sleep 1
args=(orchestration check --run run_2ea0f3afbca8 --wait --timeout-ms "$timeout"
      --types worker_done,merge_ready,escalation,question,status --json)
[ -n "$ack" ] && args+=(--ack "$ack")
orca "${args[@]}" 2>&1 | python3 -c '
import sys,json
buf=sys.stdin.buffer.read().decode("utf-8","replace")
dec=json.JSONDecoder(); i=0
while i<len(buf):
    while i<len(buf) and buf[i].isspace(): i+=1
    if i>=len(buf): break
    try: d,j=dec.raw_decode(buf,i)
    except Exception: print(buf[i:i+400]); break
    i=j
    if d.get("_keepalive") or d.get("_heartbeat"): continue
    if not d.get("ok", True): print("ERR", d.get("error")); continue
    r=d.get("result",d)
    for m in r.get("messages",[]) if isinstance(r,dict) else []:
        if m["type"]=="heartbeat" and not (m.get("body") or "").strip(): continue
        print("###",m["id"],m["type"],m["from_handle"],m["created_at"]); print((m.get("body") or "")[:2500])
    print("deliveryId",r.get("deliveryId"),"count",r.get("count"))
'
