import ctypes, ctypes.wintypes as wt, json, sys
sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
import run as r


class MONITORINFOEXW(ctypes.Structure):
    _fields_ = [("cbSize", wt.DWORD), ("rcMonitor", wt.RECT), ("rcWork", wt.RECT), ("dwFlags", wt.DWORD), ("szDevice", wt.WCHAR * 32)]


class DEVMODEW(ctypes.Structure):
    _fields_ = [("dmDeviceName", wt.WCHAR * 32), ("dmSpecVersion", wt.WORD), ("dmDriverVersion", wt.WORD), ("dmSize", wt.WORD),
                ("dmDriverExtra", wt.WORD), ("dmFields", wt.DWORD), ("pos", ctypes.c_long * 2), ("dmDisplayOrientation", wt.DWORD),
                ("dmDisplayFixedOutput", wt.DWORD), ("dmColor", ctypes.c_short), ("dmDuplex", ctypes.c_short), ("dmYResolution", ctypes.c_short),
                ("dmTTOption", ctypes.c_short), ("dmCollate", ctypes.c_short), ("dmFormName", wt.WCHAR * 32), ("dmLogPixels", wt.WORD),
                ("dmBitsPerPel", wt.DWORD), ("dmPelsWidth", wt.DWORD), ("dmPelsHeight", wt.DWORD), ("dmDisplayFlags", wt.DWORD),
                ("dmDisplayFrequency", wt.DWORD)]


out = {}
for pid in map(int, sys.argv[1:]):
    hwnd = r.window_of(pid)
    mon = ctypes.windll.user32.MonitorFromWindow(hwnd, 2)
    mi = MONITORINFOEXW(cbSize=ctypes.sizeof(MONITORINFOEXW))
    ctypes.windll.user32.GetMonitorInfoW(mon, ctypes.byref(mi))
    dm = DEVMODEW(dmSize=ctypes.sizeof(DEVMODEW))
    ctypes.windll.user32.EnumDisplaySettingsW(mi.szDevice, -1, ctypes.byref(dm))
    out[pid] = {"device": mi.szDevice, "hz": dm.dmDisplayFrequency, "rect": [mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right, mi.rcMonitor.bottom]}
print(json.dumps(out))
