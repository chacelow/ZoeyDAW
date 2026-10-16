#!/usr/bin/env bash
# Worker health snapshot. Primary signal: age of the last message in each worker's
# omp session (~/.omp/agent/sessions/<worktree>/*.jsonl). STALE when > STALE_MIN minutes.
# ASKING when the newest message this worker sent is a `question` with nothing else in its
# thread: it is blocked on the coordinator's reply, so waking it would only make it ask again.
# Also reports the last message role/stop reason, last commit age, dirty files,
# behind-main count, and leaked demo processes.
set -u
STALE_MIN="${STALE_MIN:-10}"
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 1
main=$(git rev-parse --short HEAD 2>&1) || main="ERROR:${main//$'\n'/ }"
echo "== health $(date -u +%FT%TZ) main=${main} stale>${STALE_MIN}m"
orca orchestration worker-list --run run_2ea0f3afbca8 --json 2>/dev/null | python3 -c '
import sys,json
d=json.loads(sys.stdin.buffer.read().decode("utf-8","replace")); r=d.get("result",d)
items=r if isinstance(r,list) else (r.get("workers") or r.get("items") or [])
# Every worker whose dispatch is still open: an idle worker keeps terminalState "retained",
# not "active", and an idle worker is exactly the case this check exists for.
for x in items:
    if x.get("dispatchStatus") == "dispatched" and x.get("terminalState") != "released": print(x["dispatchId"])
' | while read -r id; do
  orca orchestration worker-show --dispatch "$id" --json 2>/dev/null | python3 -c '
import sys,json
r=json.load(sys.stdin)["result"]; t=r.get("terminal") or {}
print(sys.argv[1], (t.get("worktreePath") or "-"), t.get("handle") or "-")
' "$id"
done | python3 -c '
import sys,os,json,glob,subprocess,time,datetime
stale=int(os.environ.get("STALE_MIN","10"))
now=time.time()
inbox=json.loads(subprocess.run(["orca","orchestration","inbox","--limit","1000","--json"],capture_output=True,text=True).stdout or "{}")
msgs=[m for m in ((inbox.get("result") or {}).get("messages") or []) if m.get("run_id")=="run_2ea0f3afbca8"]
threads={}
for m in msgs: threads.setdefault(m["thread_id"],[]).append(m["id"])
newest={}
for m in sorted(msgs,key=lambda m:m["created_at"]):
    if m["from_handle"].startswith("dispatch:"): newest[m["from_handle"].removeprefix("dispatch:")]=m
pending={did:[m["id"]] for did,m in newest.items() if m.get("type")=="question" and threads[m["thread_id"]]==[m["id"]]}
for line in sys.stdin:
    did,path,handle=line.split()
    wt=os.path.basename(path)
    sdir=os.path.expanduser("~/.omp/agent/sessions/-orca-workspaces-zoeydaw-"+wt)
    files=sorted(glob.glob(sdir+"/*.jsonl"), key=os.path.getmtime)
    age=None; role="-"; note=""
    if files:
        with open(files[-1],"rb") as f:
            f.seek(0,2); size=f.tell(); f.seek(max(0,size-200000))
            lines=f.read().decode("utf-8","replace").splitlines()
        for l in reversed(lines):
            try: d=json.loads(l)
            except Exception: continue
            ts=d.get("timestamp")
            if d.get("type")!="message" or not ts: continue
            age=now-datetime.datetime.fromisoformat(ts.replace("Z","+00:00")).timestamp()
            m=d.get("message") or {}
            role=m.get("role","-")
            note=(m.get("errorMessage") or m.get("stopReason") or "")
            break
    def git(*a):
        result=subprocess.run(["git","-C",path,*a],capture_output=True,text=True)
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout).strip().splitlines()[-1])
        return result.stdout.strip()
    try:
        last=git("log","-1","--format=%ct"); cm=int((now-int(last))/60)
        dirty=len([x for x in git("status","--short").splitlines() if x])
        behind=git("rev-list","--count","HEAD..gpuix-migration")
        git_note=""
    except RuntimeError as error:
        cm="?"; dirty="?"; behind="?"; git_note=" git="+str(error)[:80]
    mins=None if age is None else int(age//60)
    errored = role=="assistant" and bool((d.get("message") or {}).get("errorMessage")) if age is not None else False
    # IDLE: the agent ended its turn (TUI idle) without closing the dispatch with worker_done.
    # It cannot report on its own from that state, so the tick must wake it after IDLE_MIN.
    idle_min=int(os.environ.get("IDLE_MIN","3"))
    tui_idle=subprocess.run(["orca","terminal","wait","--terminal",handle,"--for","tui-idle","--timeout-ms","1000"],capture_output=True).returncode==0
    asks=pending.get(did,[])
    if asks: flag="ASKING"
    elif age is None: flag="NO-SESSION"
    elif errored: flag="ERROR"
    elif tui_idle and age>idle_min*60: flag="IDLE"
    elif age>stale*60: flag="STALE"
    else: flag="ok"
    detail=role+((" "+str(note)[:40]) if note else "")+((" asks="+",".join(asks)) if asks else "")+git_note
    shown=mins if mins is not None else -1
    print(f"{flag:10} {did:18} {wt:34} last-msg={shown:>3}m ({detail})  commit={cm}m dirty={dirty} behind={behind}  {handle}")
'
echo "== demo processes"
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo|smoke" | grep -vE "grep|Orca.app" | cut -c1-140 || true
echo "== idle lanes (reuse with lane.sh assign)"
bash "$(dirname "$0")/lane.sh" list 2>/dev/null | grep -E "dirty=0 merged=yes .*:(completed|failed|stopped|abandoned)$" || echo "none"
