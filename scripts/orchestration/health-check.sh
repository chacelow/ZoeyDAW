#!/usr/bin/env bash
# Worker health snapshot. Primary signal: age of the last message in each worker's
# omp session (~/.omp/agent/sessions/<worktree>/*.jsonl). STALE when > STALE_MIN minutes.
# Also reports the last message role/stop reason, last commit age, dirty files,
# behind-main count, and leaked demo processes.
set -u
STALE_MIN="${STALE_MIN:-10}"
cd /Users/caishilong/orca/workspaces/zoeydaw/gpuix-migration || exit 1
echo "== health $(date -u +%FT%TZ) main=$(git rev-parse --short HEAD) stale>${STALE_MIN}m"
orca orchestration worker-list --run run_2ea0f3afbca8 --json 2>/dev/null | python3 -c '
import sys,json
d=json.loads(sys.stdin.buffer.read().decode("utf-8","replace")); r=d.get("result",d)
items=r if isinstance(r,list) else (r.get("workers") or r.get("items") or [])
for x in items:
    if x.get("terminalState") in ("active","reclaimable"): print(x["dispatchId"])
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
        try: return subprocess.run(["git","-C",path,*a],capture_output=True,text=True).stdout.strip()
        except Exception: return ""
    last=git("log","-1","--format=%ct"); cm=int((now-int(last))/60) if last.isdigit() else -1
    dirty=len([x for x in git("status","--short").splitlines() if x])
    behind=git("rev-list","--count","HEAD..gpuix-migration") or "?"
    mins=None if age is None else int(age//60)
    errored = role=="assistant" and bool((d.get("message") or {}).get("errorMessage")) if age is not None else False
    flag="NO-SESSION" if age is None else ("ERROR" if errored else ("STALE" if age>stale*60 else "ok"))
    detail=role+((" "+str(note)[:40]) if note else "")
    shown=mins if mins is not None else -1
    print(f"{flag:10} {did:18} {wt:34} last-msg={shown:>3}m ({detail})  commit={cm}m dirty={dirty} behind={behind}  {handle}")
'
echo "== demo processes"
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo|smoke" | grep -vE "grep|Orca.app" | cut -c1-140 || true
