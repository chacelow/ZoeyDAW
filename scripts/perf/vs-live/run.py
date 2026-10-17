"""Same-method performance comparison between Ableton Live and ZoeyDAW on Windows.

Both apps get the same real OS input (SendInput, foreground window) for each scenario, and the
same Frida probe (probe.js) records input dispatch and swap-chain presents on the app's own clock.

Metrics per scenario:
  presents/s        presented frames per second during the scenario
  interval p50/p99  ms between consecutive presents
  latency p50/p99   ms from an input message being dispatched to the next present (input→present)
  cpu %             process CPU time / wall time (100 % = one core)
  ws MB             working set at the end

usage: python scripts/perf/vs-live/run.py --pid <pid> --name live --scenario drag --x0 .. --y0 .. [...]
       python scripts/perf/vs-live/run.py --compare out/live.json out/zoey.json
"""
import argparse, ctypes, ctypes.wintypes as wt, json, os, statistics, sys, time, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

INPUT_MOUSE, MOUSEEVENTF_MOVE, MOUSEEVENTF_ABSOLUTE = 0, 0x0001, 0x8000
MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_WHEEL = 0x0002, 0x0004, 0x0800
INPUT_KEYBOARD, KEYEVENTF_KEYUP, VK_CONTROL = 1, 0x0002, 0x11


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", wt.LONG), ("dy", wt.LONG), ("mouseData", wt.DWORD), ("dwFlags", wt.DWORD),
                ("time", wt.DWORD), ("dwExtraInfo", ctypes.c_size_t)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wt.WORD), ("wScan", wt.WORD), ("dwFlags", wt.DWORD), ("time", wt.DWORD),
                ("dwExtraInfo", ctypes.c_size_t)]


class _U(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("pad", ctypes.c_byte * 32)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wt.DWORD), ("u", _U)]


def send(*inputs):
    arr = (INPUT * len(inputs))(*inputs)
    user32.SendInput(len(inputs), arr, ctypes.sizeof(INPUT))


def mouse(flags, dx=0, dy=0, data=0):
    i = INPUT(type=INPUT_MOUSE)
    i.u.mi = MOUSEINPUT(dx, dy, data & 0xFFFFFFFF, flags, 0, 0)
    return i


def key(vk, up=False):
    i = INPUT(type=INPUT_KEYBOARD)
    i.u.ki = KEYBDINPUT(vk, 0, KEYEVENTF_KEYUP if up else 0, 0, 0)
    return i


def move_abs(x, y):
    w, h = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)  # virtual screen
    ox, oy = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
    nx = int((x - ox) * 65535 / (w - 1))
    ny = int((y - oy) * 65535 / (h - 1))
    send(mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | 0x4000, nx, ny))  # 0x4000 = VIRTUALDESK


def precise_sleep(seconds):
    end = time.perf_counter() + seconds
    while time.perf_counter() < end:
        pass


class FILETIME(ctypes.Structure):
    _fields_ = [("lo", wt.DWORD), ("hi", wt.DWORD)]


class PMC(ctypes.Structure):
    _fields_ = [("cb", wt.DWORD), ("PageFaultCount", wt.DWORD), ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t), ("a", ctypes.c_size_t), ("b", ctypes.c_size_t),
                ("c", ctypes.c_size_t), ("d", ctypes.c_size_t), ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t)]


def process_times(pid):
    h = kernel32.OpenProcess(0x1000 | 0x0400 | 0x0010, False, pid)
    c, e, k, u = FILETIME(), FILETIME(), FILETIME(), FILETIME()
    kernel32.GetProcessTimes(h, ctypes.byref(c), ctypes.byref(e), ctypes.byref(k), ctypes.byref(u))
    pmc = PMC(cb=ctypes.sizeof(PMC))
    ctypes.WinDLL("psapi").GetProcessMemoryInfo(h, ctypes.byref(pmc), pmc.cb)
    kernel32.CloseHandle(h)
    cpu = ((k.hi << 32 | k.lo) + (u.hi << 32 | u.lo)) / 1e7
    return cpu, pmc.WorkingSetSize / 2**20


def foreground(hwnd):
    # Attaching to the foreground thread's input queue lets SetForegroundWindow succeed without
    # synthesizing an Alt press, which would open the target's menu bar and swallow input.
    fg = user32.GetForegroundWindow()
    fg_thread = user32.GetWindowThreadProcessId(fg, None)
    me = kernel32.GetCurrentThreadId()
    user32.AttachThreadInput(me, fg_thread, True)
    user32.ShowWindow(hwnd, 9)
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    user32.AttachThreadInput(me, fg_thread, False)
    time.sleep(0.4)


def window_of(pid):
    found = []
    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(hwnd, _):
        p = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(p))
        if p.value == pid and user32.IsWindowVisible(hwnd) and user32.GetWindowTextLengthW(hwnd) > 0:
            r = wt.RECT(); user32.GetWindowRect(hwnd, ctypes.byref(r))
            found.append((hwnd, (r.right - r.left) * (r.bottom - r.top)))
        return True
    user32.EnumWindows(cb, 0)
    return max(found, key=lambda f: f[1])[0] if found else None


def quantile(values, q):
    if not values:
        return None
    s = sorted(values)
    return round(s[min(len(s) - 1, int(q * (len(s) - 1)))], 2)


def analyse(drain, t0, t1, cpu, wall, ws):
    presents = [p[0] for p in drain["presents"] if t0 <= p[0] <= t1]
    inputs = [i[0] for i in drain["inputs"] if t0 <= i[0] <= t1]
    intervals = [b - a for a, b in zip(presents, presents[1:])]
    latencies = []
    j = 0
    for t in inputs:
        while j < len(presents) and presents[j] < t:
            j += 1
        if j < len(presents):
            latencies.append(presents[j] - t)
    return {
        "presentsPerSecond": round(len(presents) / ((t1 - t0) / 1000), 1) if t1 > t0 else None,
        "intervalP50": quantile(intervals, 0.5), "intervalP99": quantile(intervals, 0.99),
        "intervalMax": round(max(intervals), 2) if intervals else None,
        "latencyP50": quantile(latencies, 0.5), "latencyP99": quantile(latencies, 0.99),
        "inputs": len(inputs), "presents": len(presents),
        "cpuPercent": round(100 * cpu / wall, 1), "workingSetMB": round(ws, 1),
    }


SCENARIOS = {}


def scenario(fn):
    SCENARIOS[fn.__name__] = fn
    return fn


@scenario
def idle(a):
    time.sleep(a.seconds)


@scenario
def drag(a):
    """Press at (x0,y0), move horizontally ±span px at 1 kHz-ish for `seconds`, release."""
    move_abs(a.x0, a.y0); time.sleep(0.05)
    send(mouse(MOUSEEVENTF_LEFTDOWN)); time.sleep(0.05)
    steps = int(a.seconds * 500)
    for i in range(steps):
        phase = (i % 200) / 200
        dx = a.span * (phase * 2 if phase < 0.5 else (1 - phase) * 2)
        move_abs(a.x0 + dx, a.y0)
        precise_sleep(0.002)
    move_abs(a.x0, a.y0); time.sleep(0.05)
    send(mouse(MOUSEEVENTF_LEFTUP))


@scenario
def zoom(a):
    """Ctrl + wheel notches over (x0,y0): in then out."""
    move_abs(a.x0, a.y0); time.sleep(0.05)
    send(key(VK_CONTROL))
    n = int(a.seconds * 20)
    for i in range(n):
        send(mouse(MOUSEEVENTF_WHEEL, data=120 if (i // 10) % 2 == 0 else -120))
        time.sleep(0.05)
    send(key(VK_CONTROL, up=True))


@scenario
def scroll(a):
    """Plain wheel notches over (x0,y0): down then up (vertical track scroll)."""
    move_abs(a.x0, a.y0); time.sleep(0.05)
    n = int(a.seconds * 30)
    for i in range(n):
        send(mouse(MOUSEEVENTF_WHEEL, data=-120 if (i // 15) % 2 == 0 else 120))
        time.sleep(1 / 30)


@scenario
def hover(a):
    """Move without buttons across the window region (hover feedback)."""
    steps = int(a.seconds * 500)
    for i in range(steps):
        phase = (i % 500) / 500
        move_abs(a.x0 + a.span * phase, a.y0 + 40 * ((i // 500) % 2))
        precise_sleep(0.002)


def run(a):
    import frida
    session = frida.attach(a.pid)
    script = session.create_script((HERE / "probe.js").read_text(encoding="utf-8"))
    script.load()
    api = script.exports_sync
    ready = api.ready()
    if not ready["hooked"]:
        sys.exit("present hook failed")
    hwnd = window_of(a.pid)
    if hwnd:
        foreground(hwnd)
    api.drain()
    stats_url = f"http://127.0.0.1:{a.stats_port}" if a.stats_port else None
    if stats_url:
        urllib.request.urlopen(stats_url + "/reset").read()
    cpu0, _ = process_times(a.pid)
    w0 = time.perf_counter()
    t0 = api.now()
    SCENARIOS[a.scenario](a)
    time.sleep(0.15)
    t1 = api.now()
    w1 = time.perf_counter()
    cpu1, ws = process_times(a.pid)
    drain = api.drain()
    result = analyse(drain, t0, t1, cpu1 - cpu0, w1 - w0, ws)
    if stats_url:
        s = json.loads(urllib.request.urlopen(stats_url + "/stats").read())
        result.update({"drawP90": s.get("p90Ms"), "drawP99": s.get("p99Ms"), "drawMax": s.get("maxMs"), "draws": s.get("samples")})
    session.detach()
    out = HERE / "out"
    out.mkdir(exist_ok=True)
    path = out / f"{a.name}-{a.scenario}.json"
    path.write_text(json.dumps({"name": a.name, "scenario": a.scenario, **result}, indent=2))
    print(json.dumps({"name": a.name, "scenario": a.scenario, **result}))


def compare(paths):
    rows = [json.loads(Path(p).read_text()) for p in paths]
    keys = ["presentsPerSecond", "intervalP50", "intervalP99", "latencyP50", "latencyP99", "drawP90", "drawP99", "cpuPercent", "workingSetMB"]
    print("| scenario | app | " + " | ".join(keys) + " |")
    print("|---|---|" + "---|" * len(keys))
    for r in rows:
        print(f"| {r['scenario']} | {r['name']} | " + " | ".join(str(r.get(k)) for k in keys) + " |")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--pid", type=int)
    p.add_argument("--name")
    p.add_argument("--scenario", choices=list(SCENARIOS))
    p.add_argument("--seconds", type=float, default=4)
    p.add_argument("--x0", type=float, default=0)
    p.add_argument("--y0", type=float, default=0)
    p.add_argument("--span", type=float, default=200)
    p.add_argument("--stats-port", type=int, help="launch-zoey.ts statsPort; adds GPUI draw times")
    p.add_argument("--compare", nargs="*")
    a = p.parse_args()
    if a.compare:
        compare(a.compare)
    else:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        run(a)
