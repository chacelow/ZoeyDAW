// Standalone Win32 probe: rustc --edition=2021 windows-caption-driver.rs -o windows-caption-driver.exe
// Coordinates are logical client coordinates; negative coordinates can address the resize frame.
use std::{env, ffi::c_void};

const WM_MOUSEMOVE: u32 = 0x0200;
const WM_NCHITTEST: u32 = 0x0084;
const WM_NCLBUTTONDBLCLK: u32 = 0x00a3;
const HTCAPTION: usize = 2;
const SMTO_ABORTIFHUNG: u32 = 0x0002;
const GW_OWNER: u32 = 4;
const TIMEOUT_MS: u32 = 2_000;
const TITLE: &str = "zoeydaw";

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Point {
    x: i32,
    y: i32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

type Hwnd = *mut c_void;

#[link(name = "user32")]
unsafe extern "system" {
    fn EnumWindows(callback: unsafe extern "system" fn(Hwnd, isize) -> i32, param: isize) -> i32;
    fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
    fn GetWindow(hwnd: Hwnd, command: u32) -> Hwnd;
    fn GetWindowTextLengthW(hwnd: Hwnd) -> i32;
    fn GetWindowTextW(hwnd: Hwnd, text: *mut u16, capacity: i32) -> i32;
    fn GetWindowRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
    fn GetClientRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
    fn ClientToScreen(hwnd: Hwnd, point: *mut Point) -> i32;
    fn GetDpiForWindow(hwnd: Hwnd) -> u32;
    fn IsZoomed(hwnd: Hwnd) -> i32;
    fn SetThreadDpiAwarenessContext(context: isize) -> isize;
    fn SendMessageTimeoutW(
        hwnd: Hwnd,
        message: u32,
        wparam: usize,
        lparam: isize,
        flags: u32,
        timeout: u32,
        result: *mut usize,
    ) -> isize;
}

struct Search {
    pid: u32,
    windows: Vec<Hwnd>,
}

unsafe extern "system" fn find_window(hwnd: Hwnd, param: isize) -> i32 {
    let search = unsafe { &mut *(param as *mut Search) };
    let mut pid = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid != search.pid || !unsafe { GetWindow(hwnd, GW_OWNER) }.is_null() {
        return 1;
    }
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length != TITLE.len() as i32 {
        return 1;
    }
    let mut text = [0u16; 8]; // "zoeydaw" plus terminator
    let copied = unsafe { GetWindowTextW(hwnd, text.as_mut_ptr(), text.len() as i32) };
    if copied == TITLE.len() as i32
        && text[..copied as usize]
            .iter()
            .copied()
            .eq(TITLE.encode_utf16())
    {
        search.windows.push(hwnd);
    }
    1
}

fn win32(what: &str, ok: i32) -> Result<(), String> {
    if ok == 0 {
        Err(format!("{what}: {}", std::io::Error::last_os_error()))
    } else {
        Ok(())
    }
}

fn target(pid: u32) -> Result<Hwnd, String> {
    let mut search = Search {
        pid,
        windows: Vec::new(),
    };
    win32("EnumWindows", unsafe {
        EnumWindows(find_window, &mut search as *mut Search as isize)
    })?;
    match search.windows.as_slice() {
        [hwnd] => Ok(*hwnd),
        [] => Err(format!(
            "no unowned top-level window with exact title {TITLE:?} for pid {pid}"
        )),
        _ => Err(format!(
            "multiple unowned top-level windows with exact title {TITLE:?} for pid {pid}"
        )),
    }
}

fn ensure_target(hwnd: Hwnd, pid: u32) -> Result<(), String> {
    let mut observed = 0;
    let thread = unsafe { GetWindowThreadProcessId(hwnd, &mut observed) };
    if thread == 0 || observed != pid || !unsafe { GetWindow(hwnd, GW_OWNER) }.is_null() {
        return Err(format!(
            "target window no longer belongs to pid {pid} as an unowned top-level window"
        ));
    }
    let mut title = [0u16; 8];
    let copied = unsafe { GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32) };
    if copied != TITLE.len() as i32
        || !title[..copied as usize]
            .iter()
            .copied()
            .eq(TITLE.encode_utf16())
    {
        return Err(format!("target window no longer has exact title {TITLE:?}"));
    }
    Ok(())
}

struct Snapshot {
    client_origin: Point,
    client: Rect,
    bounds: Rect,
    dpi: u32,
    zoomed: bool,
}

fn snapshot(hwnd: Hwnd, pid: u32) -> Result<Snapshot, String> {
    ensure_target(hwnd, pid)?;
    let (mut client, mut bounds, mut client_origin) =
        (Rect::default(), Rect::default(), Point::default());
    win32("GetClientRect", unsafe { GetClientRect(hwnd, &mut client) })?;
    win32("GetWindowRect", unsafe { GetWindowRect(hwnd, &mut bounds) })?;
    win32("ClientToScreen", unsafe {
        ClientToScreen(hwnd, &mut client_origin)
    })?;
    let dpi = unsafe { GetDpiForWindow(hwnd) };
    if dpi == 0 {
        return Err("GetDpiForWindow returned zero".into());
    }
    Ok(Snapshot {
        client_origin,
        client,
        bounds,
        dpi,
        zoomed: unsafe { IsZoomed(hwnd) != 0 },
    })
}

fn rect_json(rect: Rect) -> String {
    format!(
        "{{\"left\":{},\"top\":{},\"right\":{},\"bottom\":{}}}",
        rect.left, rect.top, rect.right, rect.bottom
    )
}

fn snapshot_json(hwnd: Hwnd, pid: u32, s: &Snapshot) -> String {
    format!(
        "\"hwnd\":{},\"pid\":{},\"dpi\":{},\"clientOrigin\":{{\"x\":{},\"y\":{}}},\"clientWidth\":{},\"clientHeight\":{},\"bounds\":{},\"isZoomed\":{}",
        hwnd as usize, pid, s.dpi, s.client_origin.x, s.client_origin.y,
        s.client.right - s.client.left, s.client.bottom - s.client.top, rect_json(s.bounds), s.zoomed
    )
}

fn packed(x: i32, y: i32) -> Result<isize, String> {
    let x = i16::try_from(x).map_err(|_| "x exceeds signed Win32 message coordinate range")?;
    let y = i16::try_from(y).map_err(|_| "y exceeds signed Win32 message coordinate range")?;
    Ok((((y as u16 as u32) << 16) | x as u16 as u32) as i32 as isize)
}

fn point(logical_x: f64, logical_y: f64, s: &Snapshot) -> Result<(Point, Point), String> {
    fn physical(value: f64, dpi: u32) -> Result<i32, String> {
        let scaled = (value * dpi as f64 / 96.0).round();
        if !scaled.is_finite() || scaled < i32::MIN as f64 || scaled > i32::MAX as f64 {
            return Err("logical coordinate cannot be represented as a physical pixel".into());
        }
        Ok(scaled as i32)
    }
    let client = Point {
        x: physical(logical_x, s.dpi)?,
        y: physical(logical_y, s.dpi)?,
    };
    let screen = Point {
        x: s.client_origin
            .x
            .checked_add(client.x)
            .ok_or("screen x overflow")?,
        y: s.client_origin
            .y
            .checked_add(client.y)
            .ok_or("screen y overflow")?,
    };
    packed(client.x, client.y)?;
    packed(screen.x, screen.y)?;
    Ok((client, screen))
}

fn send(hwnd: Hwnd, pid: u32, message: u32, wparam: usize, lparam: isize) -> Result<isize, String> {
    ensure_target(hwnd, pid)?;
    let mut result = 0usize;
    let ok = unsafe {
        SendMessageTimeoutW(
            hwnd,
            message,
            wparam,
            lparam,
            SMTO_ABORTIFHUNG,
            TIMEOUT_MS,
            &mut result,
        )
    };
    if ok == 0 {
        return Err(format!(
            "SendMessageTimeoutW({message:#x}) failed or timed out: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(result as isize)
}

fn hit(hwnd: Hwnd, pid: u32, client: Point, screen: Point) -> Result<isize, String> {
    // GPUI's WM_NCHITTEST callback reads its last rendered mouse_hit_test, not the
    // WM_NCHITTEST lParam. A targeted WM_MOUSEMOVE updates that hit test first.
    send(hwnd, pid, WM_MOUSEMOVE, 0, packed(client.x, client.y)?)?;
    send(hwnd, pid, WM_NCHITTEST, 0, packed(screen.x, screen.y)?)
}

fn usage() -> &'static str {
    "usage: windows-caption-driver.exe <pid> query | <pid> hit <client-x> <client-y> | <pid> double <client-x> <client-y>\n\
     Coordinates are logical client pixels (fractional and negative allowed); target is the single unowned top-level window titled exactly zoeydaw in <pid>.\n\
     hit prepares GPUI with a targeted WM_MOUSEMOVE then reports the native WM_NCHITTEST code.\n\
     double requires HTCAPTION, sends WM_NCLBUTTONDBLCLK, and reports before/after snapshots; invoke twice to verify restore."
}

fn run() -> Result<(), String> {
    let args: Vec<_> = env::args().collect();
    if args.len() < 3
        || !matches!(args[2].as_str(), "query" | "hit" | "double")
        || (args[2] == "query" && args.len() != 3)
        || (args[2] != "query" && args.len() != 5)
    {
        return Err(usage().into());
    }
    let pid: u32 = args[1]
        .parse()
        .map_err(|_| "pid must be a nonzero decimal u32")?;
    if pid == 0 {
        return Err("pid must be nonzero".into());
    }
    // The caller must see real physical screen/client coordinates, including on a
    // mixed-DPI desktop. This does not change the target process's DPI context.
    if unsafe { SetThreadDpiAwarenessContext(-4) } == 0 {
        return Err(format!(
            "SetThreadDpiAwarenessContext(PER_MONITOR_AWARE_V2): {}",
            std::io::Error::last_os_error()
        ));
    }
    let hwnd = target(pid)?;
    let before = snapshot(hwnd, pid)?;
    if args[2] == "query" {
        println!(
            "{{\"action\":\"query\",{}}}",
            snapshot_json(hwnd, pid, &before)
        );
        return Ok(());
    }
    let x: f64 = args[3]
        .parse()
        .map_err(|_| "client-x must be a finite number")?;
    let y: f64 = args[4]
        .parse()
        .map_err(|_| "client-y must be a finite number")?;
    let (client, screen) = point(x, y, &before)?;
    let hit_code = hit(hwnd, pid, client, screen)?;
    let common = format!(
        "\"logicalClient\":{{\"x\":{x},\"y\":{y}}},\"physicalClient\":{{\"x\":{},\"y\":{}}},\"screen\":{{\"x\":{},\"y\":{}}},\"hitTest\":{hit_code}",
        client.x, client.y, screen.x, screen.y
    );
    if args[2] == "hit" {
        println!(
            "{{\"action\":\"hit\",{},{common}}}",
            snapshot_json(hwnd, pid, &before)
        );
        return Ok(());
    }
    if hit_code != HTCAPTION as isize {
        return Err(format!("refusing WM_NCLBUTTONDBLCLK: hit-test returned {hit_code}, expected HTCAPTION ({HTCAPTION})"));
    }
    send(
        hwnd,
        pid,
        WM_NCLBUTTONDBLCLK,
        HTCAPTION,
        packed(screen.x, screen.y)?,
    )?;
    let after = snapshot(hwnd, pid)?;
    println!(
        "{{\"action\":\"double\",{common},\"before\":{{{}}},\"after\":{{{}}}}}",
        snapshot_json(hwnd, pid, &before),
        snapshot_json(hwnd, pid, &after)
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
