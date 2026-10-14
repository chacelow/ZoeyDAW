use napi_derive::napi;

/// Read UTF-8 text from the system clipboard; absent text or unsupported platforms return None.
#[napi]
pub fn clipboard_read_text() -> Option<String> {
    platform::read_text()
}

/// Replace system clipboard contents with text; unsupported platforms return an error.
#[napi]
pub fn clipboard_write_text(text: String) -> napi::Result<()> {
    platform::write_text(&text)
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{NSPasteboard, NSPasteboardType, NSPasteboardTypeString};

    // Verified on macOS arm64, Bun 1.3.14 / gpuix 0.10.0: both main-thread and
    // Bun Worker calls roundtrip UTF-8 before and after gpuix creates its window.
    // generalPasteboard does not pre-create an incompatible NSApplication (no
    // GPUI initialization panic). Do not replace it with sharedApplication.
    // Each call owns an autorelease pool, including workers without an AppKit loop.
    pub fn read_text() -> Option<String> {
        autoreleasepool(|_| {
            let pasteboard = NSPasteboard::generalPasteboard();
            // SAFETY: AppKit exports this immutable NSString constant for the process lifetime.
            pasteboard
                .stringForType(unsafe { NSPasteboardTypeString })
                .map(|text| text.to_string())
        })
    }

    pub fn write_text(text: &str) -> napi::Result<()> {
        autoreleasepool(|_| {
            let pasteboard = NSPasteboard::generalPasteboard();
            // NSPasteboardType is AppKit's NSString alias, avoiding another direct crate dependency.
            let text = NSPasteboardType::from_str(text);
            pasteboard.clearContents();
            // SAFETY: AppKit exports this immutable NSString constant for the process lifetime.
            if pasteboard.setString_forType(&text, unsafe { NSPasteboardTypeString }) {
                Ok(())
            } else {
                Err(napi::Error::from_reason(
                    "NSPasteboard failed to write clipboard text",
                ))
            }
        })
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    pub fn read_text() -> Option<String> {
        None
    }

    pub fn write_text(_text: &str) -> napi::Result<()> {
        Err(napi::Error::from_reason(
            "System clipboard text writing is not implemented on this platform",
        ))
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn unsupported_platform_does_not_claim_success() {
            assert_eq!(super::read_text(), None);
            assert!(super::write_text("中文\n🎹").is_err());
        }
    }
}
