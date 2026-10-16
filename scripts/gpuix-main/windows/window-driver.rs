#![cfg(target_os = "windows")]

use std::ffi::c_void;
use std::io;
use std::thread;
use std::time::{Duration, Instant};

type Hwnd = *mut c_void;

#[link(name = "user32")]
extern "system" {
    fn EnumWindows(callback: unsafe extern "system" fn(Hwnd, isize) -> i32, data: isize) -> i32;
    fn GetWindowThreadProcessId(window: Hwnd, pid: *mut u32) -> u32;
    fn GetWindowTextLengthW(window: Hwnd) -> i32;
    fn GetWindowTextW(window: Hwnd, text: *mut u16, capacity: i32) -> i32;
    fn IsWindow(window: Hwnd) -> i32;
    fn IsIconic(window: Hwnd) -> i32;
    fn ShowWindowAsync(window: Hwnd, command: i32) -> i32;
    fn PostMessageW(window: Hwnd, message: u32, wparam: usize, lparam: isize) -> i32;
}

struct Target {
    pid: u32,
    title: Vec<u16>,
    matches: Vec<Hwnd>,
}

impl Target {
    fn owns(&self, window: Hwnd) -> bool {
        unsafe {
            let mut pid = 0;
            if IsWindow(window) == 0
                || GetWindowThreadProcessId(window, &mut pid) == 0
                || pid != self.pid
            {
                return false;
            }
            let length = GetWindowTextLengthW(window);
            if length <= 0 || length as usize != self.title.len() {
                return false;
            }
            let mut title = vec![0; length as usize + 1];
            let copied = GetWindowTextW(window, title.as_mut_ptr(), length + 1);
            copied == length && title[..length as usize] == self.title
        }
    }

    fn require_owned(&self, window: Hwnd) -> Result<(), String> {
        if self.owns(window) {
            Ok(())
        } else {
            Err("Target HWND no longer belongs to the exact PID and title".into())
        }
    }
}

unsafe extern "system" fn collect(window: Hwnd, data: isize) -> i32 {
    let target = &mut *(data as *mut Target);
    if target.owns(window) {
        target.matches.push(window);
    }
    1
}

fn run() -> Result<(), String> {
    if std::env::var("GITHUB_ACTIONS").as_deref() != Ok("true") {
        return Err("The window driver is restricted to Windows Actions smoke verification".into());
    }
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [pid, title, action] = args.as_slice() else {
        return Err("Expected: window-driver <PID> <exact-title> <query|minimize|restore|close>".into());
    };
    let pid: u32 = pid.parse().map_err(|_| "Invalid PID")?;
    if pid == 0 || title.is_empty() || title.contains('\0') {
        return Err("An exact nonempty title and nonzero PID are required".into());
    }
    if !matches!(action.as_str(), "query" | "minimize" | "restore" | "close") {
        return Err("Unknown window action".into());
    }
    let mut target = Target {
        pid,
        title: title.encode_utf16().collect(),
        matches: Vec::new(),
    };
    if unsafe { EnumWindows(collect, &mut target as *mut Target as isize) } == 0 {
        return Err(format!("EnumWindows failed: {}", io::Error::last_os_error()));
    }
    let window = match target.matches.as_slice() {
        [] if action == "query" => {
            println!("{{\"found\":false,\"minimized\":false}}");
            return Ok(());
        }
        [window] => *window,
        [] => return Err("No window belongs to the exact PID and title".into()),
        _ => return Err("Multiple windows belong to the exact PID and title".into()),
    };
    target.require_owned(window)?;
    match action.as_str() {
        "query" => {}
        "close" => {
            target.require_owned(window)?;
            if unsafe { PostMessageW(window, 0x0010, 0, 0) } == 0 {
                return Err(format!("WM_CLOSE failed: {}", io::Error::last_os_error()));
            }
        }
        "minimize" | "restore" => {
            let minimized = action == "minimize";
            target.require_owned(window)?;
            if unsafe { ShowWindowAsync(window, if minimized { 6 } else { 9 }) } == 0 {
                return Err(format!("ShowWindowAsync failed: {}", io::Error::last_os_error()));
            }
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                target.require_owned(window)?;
                if (unsafe { IsIconic(window) } != 0) == minimized {
                    break;
                }
                if Instant::now() >= deadline {
                    return Err(format!("Window did not complete {action} within five seconds"));
                }
                thread::sleep(Duration::from_millis(10));
            }
        }
        _ => unreachable!(),
    }
    let found = target.owns(window);
    let minimized = found && unsafe { IsIconic(window) } != 0;
    println!("{{\"found\":{found},\"minimized\":{minimized}}}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
