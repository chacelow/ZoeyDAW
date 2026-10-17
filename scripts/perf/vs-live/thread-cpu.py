"""Per-thread CPU of a process over a window: python thread-cpu.py <pid> <seconds>.

Prints threads that used more than 1% of one core, with their description (SetThreadDescription)
so the GPUI UI thread, the Bun JS thread and the renderer threads can be told apart.
"""
import ctypes, ctypes.wintypes as wt, json, sys, time

k32 = ctypes.windll.kernel32


class THREADENTRY32(ctypes.Structure):
    _fields_ = [("dwSize", wt.DWORD), ("cntUsage", wt.DWORD), ("th32ThreadID", wt.DWORD), ("th32OwnerProcessID", wt.DWORD),
                ("tpBasePri", ctypes.c_long), ("tpDeltaPri", ctypes.c_long), ("dwFlags", wt.DWORD)]


def threads(pid):
    snap = k32.CreateToolhelp32Snapshot(0x4, 0)
    e = THREADENTRY32(dwSize=ctypes.sizeof(THREADENTRY32))
    out = []
    ok = k32.Thread32First(snap, ctypes.byref(e))
    while ok:
        if e.th32OwnerProcessID == pid:
            out.append(e.th32ThreadID)
        ok = k32.Thread32Next(snap, ctypes.byref(e))
    k32.CloseHandle(snap)
    return out


def sample(tids):
    result = {}
    for tid in tids:
        h = k32.OpenThread(0x0800 | 0x0040, False, tid)
        if not h:
            continue
        c, x, kt, ut = (wt.FILETIME() for _ in range(4))
        k32.GetThreadTimes(h, ctypes.byref(c), ctypes.byref(x), ctypes.byref(kt), ctypes.byref(ut))
        name = ctypes.c_wchar_p()
        k32.GetThreadDescription(h, ctypes.byref(name))
        result[tid] = ((kt.dwHighDateTime << 32 | kt.dwLowDateTime) + (ut.dwHighDateTime << 32 | ut.dwLowDateTime), name.value or "")
        k32.CloseHandle(h)
    return result


pid, seconds = int(sys.argv[1]), float(sys.argv[2])
before = sample(threads(pid))
time.sleep(seconds)
after = sample(threads(pid))
rows = []
for tid, (t, name) in after.items():
    used = (t - before.get(tid, (0, ""))[0]) / 1e7 / seconds * 100
    if used > 1:
        rows.append({"tid": tid, "name": name, "cpu%": round(used, 1)})
print(json.dumps(sorted(rows, key=lambda r: -r["cpu%"])))
