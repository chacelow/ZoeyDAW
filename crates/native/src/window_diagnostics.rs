use napi_derive::napi;

#[napi(object)]
pub struct WindowDiagnostics {
    pub is_key_window: bool,
    pub is_main_window: bool,
    pub occlusion_visible: bool,
    pub is_miniaturized: bool,
    pub is_visible: bool,
    pub app_is_active: bool,
}

/// Read AppKit on Bun's calling main thread; never dispatch this onto a napi worker.
#[napi]
pub fn window_diagnostics(window_title: String) -> napi::Result<Option<WindowDiagnostics>> {
    platform::read(&window_title)
}

fn find_window_index(title: &str, titles: impl Iterator<Item = String>) -> Option<usize> {
    titles
        .enumerate()
        .find_map(|(index, candidate)| (candidate == title).then_some(index))
}

#[cfg(target_os = "macos")]
mod platform {
    use super::WindowDiagnostics;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSWindowOcclusionState};

    extern "C" {
        static mut NSApp: *const NSApplication;
    }

    pub fn read(title: &str) -> napi::Result<Option<WindowDiagnostics>> {
        MainThreadMarker::new().ok_or_else(|| {
            napi::Error::from_reason("Window diagnostics require the main thread")
        })?;
        // SAFETY: NSApp is read only on AppKit's main thread and remains owned by AppKit.
        let Some(app) = (unsafe { core::ptr::addr_of!(NSApp).read().as_ref() }) else {
            return Ok(None);
        };
        let windows = app.windows();
        if let Some(index) = super::find_window_index(
            title,
            (0..windows.count()).map(|index| windows.objectAtIndex(index).title().to_string()),
        ) {
            let window = windows.objectAtIndex(index);
            return Ok(Some(WindowDiagnostics {
                is_key_window: window.isKeyWindow(),
                is_main_window: window.isMainWindow(),
                occlusion_visible: window
                    .occlusionState()
                    .contains(NSWindowOcclusionState::Visible),
                is_miniaturized: window.isMiniaturized(),
                is_visible: window.isVisible(),
                app_is_active: app.isActive(),
            }));
        }
        Ok(None)
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::WindowDiagnostics;
    pub fn read(_: &str) -> napi::Result<Option<WindowDiagnostics>> {
        Err(napi::Error::from_reason(
            "Window diagnostics are only supported on macOS",
        ))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn nonexistent_title_has_no_window() {
        let titles = ["probe", "cover"];
        assert_eq!(
            super::find_window_index("missing", titles.iter().map(|s| s.to_string())),
            None
        );
        assert_eq!(
            super::find_window_index("cover", titles.iter().map(|s| s.to_string())),
            Some(1)
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn worker_thread_cannot_read_appkit() {
        assert!(super::window_diagnostics("probe".into()).is_err());
    }
}
