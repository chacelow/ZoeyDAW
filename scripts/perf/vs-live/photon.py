"""Motion-to-photon latency of a divider drag, measured on screen.

python photon.py --pid <pid> --x <screen-x> --y <screen-y> [--steps 40] [--step-px 4]

Presses on the divider at (x, y), then moves the mouse by --step-px at a time and polls the screen
through DXGI Desktop Duplication until the divider is seen at its new column. The probe is a
horizontal strip through (x, y); the divider is located by matching the pressed-state profile
around the start column. Each sample is the time from SendInput to the first composed frame that
shows the move: input handling, layout, paint, present and DWM composition, which is what the
user sees. Run with the target window in the foreground and nothing covering the strip.
"""
import argparse, ctypes, json, statistics, sys, time
import numpy as np
import dxcam

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
import run as r

p = argparse.ArgumentParser()
p.add_argument("--pid", type=int, required=True)
p.add_argument("--x", type=float, required=True)
p.add_argument("--y", type=float, required=True)
p.add_argument("--steps", type=int, default=40)
p.add_argument("--step-px", type=int, default=4)
p.add_argument("--band", type=int, default=120, help="half width of the probed strip in pixels")
p.add_argument("--timeout-ms", type=float, default=200)
p.add_argument("--name", default="app")
a = p.parse_args()

camera = dxcam.create(output_color="BGRA")
x0, y0 = int(round(a.x)), int(round(a.y))
region = (x0 - a.band, y0 - 2, x0 + a.band, y0 + 3)
HALF = 9


def grab():
    frame = None
    while frame is None:
        frame = camera.grab(region=region)
    return frame.astype(np.int16).mean(axis=(0, 2)).ravel()


def divider_column(strip, template):
    best, best_score = a.band, None
    for c in range(HALF, len(strip) - HALF):
        score = np.abs(strip[c - HALF : c + HALF + 1] - template).sum()
        if best_score is None or score < best_score:
            best, best_score = c, score
    return best


r.foreground(r.window_of(a.pid))
r.move_abs(a.x, a.y)
time.sleep(0.3)
r.send(r.mouse(r.MOUSEEVENTF_LEFTDOWN))
time.sleep(0.3)
reference = grab()
template = reference[a.band - HALF : a.band + HALF + 1]
start_col = divider_column(reference, template)
latencies, misses = [], 0
offset = 0
direction = 1
for _ in range(a.steps):
    if abs(offset + direction * a.step_px) > a.band - 2 * HALF:
        direction = -direction
    offset += direction * a.step_px
    expected = start_col + offset
    sent = time.perf_counter()
    r.move_abs(a.x + offset, a.y)
    seen = None
    while (time.perf_counter() - sent) * 1000 < a.timeout_ms:
        if abs(divider_column(grab(), template) - expected) <= 1:
            seen = time.perf_counter()
            break
    if seen is None:
        misses += 1
    else:
        latencies.append((seen - sent) * 1000)
    time.sleep(0.03)
r.move_abs(a.x, a.y)
time.sleep(0.1)
r.send(r.mouse(r.MOUSEEVENTF_LEFTUP))
camera.release()


def q(values, k):
    s = sorted(values)
    return round(s[min(len(s) - 1, int(k * (len(s) - 1)))], 2) if s else None


print(json.dumps({
    "name": a.name,
    "samples": len(latencies),
    "misses": misses,
    "p50": q(latencies, 0.5),
    "p90": q(latencies, 0.9),
    "max": round(max(latencies), 2) if latencies else None,
    "mean": round(statistics.mean(latencies), 2) if latencies else None,
}))
