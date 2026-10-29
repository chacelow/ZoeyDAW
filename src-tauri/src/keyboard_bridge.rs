use serde::Serialize;
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
};
use tauri::{AppHandle, Emitter};

#[derive(Clone)]
pub struct KeyboardBridge {
    inner: Arc<BridgeState>,
}

struct BridgeState {
    app: AppHandle,
    active_helpers: Mutex<HashSet<u32>>,
    midi_mode: AtomicBool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeKeyboardEvent {
    kind: &'static str,
    key: &'static str,
    code: &'static str,
    repeat: bool,
}

#[cfg(windows)]
static HOOK_STATE: OnceLock<Arc<BridgeState>> = OnceLock::new();

impl KeyboardBridge {
    pub fn start(app: AppHandle) -> Result<Self, String> {
        let inner = Arc::new(BridgeState {
            app,
            active_helpers: Mutex::new(HashSet::new()),
            midi_mode: AtomicBool::new(false),
        });
        #[cfg(windows)]
        {
            let state = Arc::clone(&inner);
            thread::Builder::new()
                .name("zoeydaw-keyboard-bridge".into())
                .spawn(move || run_windows_hook(state))
                .map_err(|error| error.to_string())?;
        }
        Ok(Self { inner })
    }

    pub fn set_editor_process(&self, process_id: u32, active: bool) -> Result<(), String> {
        let mut helpers = self
            .inner
            .active_helpers
            .lock()
            .map_err(|_| "Keyboard bridge state poisoned")?;
        if active {
            helpers.insert(process_id);
        } else {
            helpers.remove(&process_id);
        }
        Ok(())
    }

    pub fn set_midi_mode(&self, enabled: bool) {
        self.inner.midi_mode.store(enabled, Ordering::Release);
    }
}

#[cfg(windows)]
fn run_windows_hook(state: Arc<BridgeState>) {
    use std::ptr::null_mut;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage, MSG, WH_KEYBOARD_LL,
    };
    if HOOK_STATE.set(state).is_err() {
        return;
    }
    let module = unsafe { GetModuleHandleW(null_mut()) };
    let hook = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), module, 0) };
    if hook.is_null() {
        return;
    }
    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, null_mut(), 0, 0) } > 0 {
        unsafe {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

#[cfg(windows)]
unsafe extern "system" fn keyboard_hook(code: i32, wparam: usize, lparam: isize) -> isize {
    use windows_sys::Win32::UI::WindowsAndMessaging::KBDLLHOOKSTRUCT;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetForegroundWindow, GetWindowThreadProcessId, HC_ACTION, WM_KEYDOWN,
        WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };
    if code != HC_ACTION as i32 {
        return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) };
    }
    let kind = match wparam as u32 {
        WM_KEYDOWN | WM_SYSKEYDOWN => "keydown",
        WM_KEYUP | WM_SYSKEYUP => "keyup",
        _ => return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) },
    };
    let Some(state) = HOOK_STATE.get() else {
        return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) };
    };
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_null() {
        return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) };
    }
    let mut process_id = 0;
    unsafe {
        GetWindowThreadProcessId(foreground, &mut process_id);
    }
    let active = state
        .active_helpers
        .lock()
        .map(|helpers| helpers.contains(&process_id))
        .unwrap_or(false);
    if !active {
        return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) };
    }
    let input = unsafe { &*(lparam as *const KBDLLHOOKSTRUCT) };
    let Some((key, code_name)) = keyboard_name(input.vkCode) else {
        return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) };
    };
    let event = NativeKeyboardEvent {
        kind,
        key,
        code: code_name,
        repeat: kind == "keydown" && (input.flags & 0x4000) != 0,
    };
    let _ = state.app.emit_to("main", "native-editor-keyboard", event);
    let host_shortcut = matches!(input.vkCode, 0x20 | 0x41 | 0x4D);
    let midi_key = matches!(
        input.vkCode,
        0x41 | 0x57
            | 0x53
            | 0x45
            | 0x44
            | 0x46
            | 0x54
            | 0x47
            | 0x59
            | 0x48
            | 0x55
            | 0x4A
            | 0x4B
            | 0x4F
            | 0x4C
            | 0x50
            | 0x5A
            | 0x58
            | 0x43
            | 0x56
    );
    if host_shortcut || (midi_key && state.midi_mode.load(Ordering::Acquire)) {
        1
    } else {
        unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
    }
}

#[cfg(windows)]
fn keyboard_name(vk: u32) -> Option<(&'static str, &'static str)> {
    Some(match vk {
        0x41 => ("a", "KeyA"),
        0x57 => ("w", "KeyW"),
        0x53 => ("s", "KeyS"),
        0x45 => ("e", "KeyE"),
        0x44 => ("d", "KeyD"),
        0x46 => ("f", "KeyF"),
        0x54 => ("t", "KeyT"),
        0x47 => ("g", "KeyG"),
        0x59 => ("y", "KeyY"),
        0x48 => ("h", "KeyH"),
        0x55 => ("u", "KeyU"),
        0x4A => ("j", "KeyJ"),
        0x4B => ("k", "KeyK"),
        0x4F => ("o", "KeyO"),
        0x4C => ("l", "KeyL"),
        0x50 => ("p", "KeyP"),
        0x5A => ("z", "KeyZ"),
        0x58 => ("x", "KeyX"),
        0x43 => ("c", "KeyC"),
        0x56 => ("v", "KeyV"),
        0x4D => ("m", "KeyM"),
        0x20 => (" ", "Space"),
        _ => return None,
    })
}
#[tauri::command(rename_all = "camelCase")]
pub fn keyboard_bridge_set_midi_mode(bridge: tauri::State<'_, KeyboardBridge>, enabled: bool) {
    bridge.set_midi_mode(enabled);
}
