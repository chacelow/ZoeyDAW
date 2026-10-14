use napi_derive::napi;

/// Read-only application activation state; unsupported platforms return unknown.
#[napi]
pub fn is_application_active() -> Option<bool> {
    platform::is_application_active()
}

#[cfg(any(windows, test))]
fn activity_for_process(foreground_process_id: u32, current_process_id: u32) -> Option<bool> {
    (foreground_process_id != 0).then_some(foreground_process_id == current_process_id)
}

#[cfg(test)]
mod tests {
    use super::activity_for_process;

    #[test]
    fn foreground_process_determines_activity() {
        assert_eq!(activity_for_process(42, 42), Some(true));
        assert_eq!(activity_for_process(99, 42), Some(false));
        assert_eq!(activity_for_process(0, 42), None);
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2_app_kit::NSRunningApplication;

    pub fn is_application_active() -> Option<bool> {
        // Measured on macOS with Bun 1.3.14 / gpuix 0.10.0: bun --hot calls
        // napi on the main thread, but Bun Worker calls have no MainThreadMarker.
        // NSApplication::sharedApplication would create a plain NSApplication before
        // gpuix initializes, causing GPUI to panic: "Ivar platform not found".
        // NSRunningApplication is read-only and its properties are atomic/thread-safe;
        // both calling threads were observed tracking Finder activation transitions.
        // The native UI must keep its main run loop running to refresh this state.
        Some(NSRunningApplication::currentApplication().isActive())
    }
}

#[cfg(windows)]
mod platform {
    use super::activity_for_process;
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    pub fn is_application_active() -> Option<bool> {
        // These read-only APIs accept no owned resources. A missing foreground window
        // or failed process lookup is unknown, not evidence that this app is inactive.
        unsafe {
            let window = GetForegroundWindow();
            if window.is_null() {
                return None;
            }
            let mut foreground_process_id = 0;
            if GetWindowThreadProcessId(window, &mut foreground_process_id) == 0 {
                return None;
            }
            activity_for_process(foreground_process_id, GetCurrentProcessId())
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn is_application_active() -> Option<bool> {
        None
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn unsupported_platform_is_unknown() {
            assert_eq!(super::is_application_active(), None);
        }
    }
}
