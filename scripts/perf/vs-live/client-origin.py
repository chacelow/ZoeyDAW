import ctypes, ctypes.wintypes as wt, json, sys
sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
import run as r
pid = int(sys.argv[1])
hwnd = r.window_of(pid)
pt = wt.POINT(0, 0)
ctypes.windll.user32.ClientToScreen(hwnd, ctypes.byref(pt))
dpi = ctypes.windll.user32.GetDpiForWindow(hwnd)
rc = wt.RECT(); ctypes.windll.user32.GetClientRect(hwnd, ctypes.byref(rc))
print(json.dumps({"hwnd": hwnd, "x": pt.x, "y": pt.y, "scale": dpi / 96, "client": [rc.right, rc.bottom]}))
