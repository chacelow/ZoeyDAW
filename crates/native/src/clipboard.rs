use napi_derive::napi;

#[napi]
pub fn clipboard_read_text() -> Option<String> {
    platform::read_text()
}

#[napi]
pub fn clipboard_write_text(text: String) -> napi::Result<()> {
    platform::write_text(&text)
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{NSPasteboard, NSPasteboardType, NSPasteboardTypeString};

    pub fn read_text() -> Option<String> {
        autoreleasepool(|_| {
            let pasteboard = NSPasteboard::generalPasteboard();
            pasteboard
                .stringForType(unsafe { NSPasteboardTypeString })
                .map(|text| text.to_string())
        })
    }

    pub fn write_text(text: &str) -> napi::Result<()> {
        autoreleasepool(|_| {
            let pasteboard = NSPasteboard::generalPasteboard();
            let text = NSPasteboardType::from_str(text);
            pasteboard.clearContents();
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

#[cfg(any(windows, test))]
fn unicode_text(text: &str) -> Result<impl Iterator<Item = u16> + Clone + '_, &'static str> {
    if text.contains('\0') {
        return Err("Windows clipboard text cannot contain U+0000");
    }
    Ok(text.encode_utf16().chain(std::iter::once(0)))
}

#[cfg(any(windows, test))]
fn decode_unicode_text(units: &[u16]) -> Option<String> {
    let end = units.iter().position(|unit| *unit == 0)?;
    String::from_utf16(&units[..end]).ok()
}

#[cfg(windows)]
mod platform {
    use std::{mem::size_of, ptr};
    use windows_sys::{
        core::w,
        Win32::{
            Foundation::{GlobalFree, HGLOBAL, HWND},
            System::{
                DataExchange::{
                    CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard,
                    SetClipboardData,
                },
                Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE},
            },
            UI::WindowsAndMessaging::{CreateWindowExW, DestroyWindow},
        },
    };

    const UNICODE_TEXT: u32 = 13;

    struct Owner(HWND);
    impl Owner {
        fn new() -> Option<Self> {
            let hwnd = unsafe {
                CreateWindowExW(
                    0,
                    w!("STATIC"),
                    w!("Zoeydaw clipboard"),
                    0,
                    0,
                    0,
                    0,
                    0,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    ptr::null_mut(),
                    ptr::null(),
                )
            };
            (!hwnd.is_null()).then_some(Self(hwnd))
        }
    }
    impl Drop for Owner {
        fn drop(&mut self) {
            unsafe {
                DestroyWindow(self.0);
            }
        }
    }

    struct Clipboard;
    impl Clipboard {
        fn open(owner: &Owner) -> Option<Self> {
            (unsafe { OpenClipboard(owner.0) } != 0).then_some(Self)
        }
    }
    impl Drop for Clipboard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }

    struct Locked(HGLOBAL, *mut u16);
    impl Locked {
        fn new(handle: HGLOBAL) -> Option<Self> {
            let pointer = unsafe { GlobalLock(handle) }.cast::<u16>();
            (!pointer.is_null()).then_some(Self(handle, pointer))
        }
    }
    impl Drop for Locked {
        fn drop(&mut self) {
            unsafe {
                GlobalUnlock(self.0);
            }
        }
    }

    struct Allocation(HGLOBAL);
    impl Allocation {
        fn new(units: impl Iterator<Item = u16> + Clone) -> Option<Self> {
            let bytes = units.clone().count().checked_mul(size_of::<u16>())?;
            let handle = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes) };
            if handle.is_null() {
                return None;
            }
            let allocation = Self(handle);
            let locked = Locked::new(handle)?;
            for (index, unit) in units.enumerate() {
                unsafe {
                    locked.1.add(index).write(unit);
                }
            }
            Some(allocation)
        }

        fn transfer(&mut self) -> bool {
            if unsafe { SetClipboardData(UNICODE_TEXT, self.0) }.is_null() {
                return false;
            }
            self.0 = ptr::null_mut();
            true
        }
    }
    impl Drop for Allocation {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    GlobalFree(self.0);
                }
            }
        }
    }

    pub fn read_text() -> Option<String> {
        let owner = Owner::new()?;
        let _clipboard = Clipboard::open(&owner)?;
        let handle = unsafe { GetClipboardData(UNICODE_TEXT) };
        if handle.is_null() {
            return None;
        }
        let bytes = unsafe { GlobalSize(handle) };
        if bytes < size_of::<u16>() || bytes % size_of::<u16>() != 0 || bytes > isize::MAX as usize
        {
            return None;
        }
        let locked = Locked::new(handle)?;
        let units = unsafe { std::slice::from_raw_parts(locked.1, bytes / size_of::<u16>()) };
        super::decode_unicode_text(units)
    }

    pub fn write_text(text: &str) -> napi::Result<()> {
        let units = super::unicode_text(text).map_err(napi::Error::from_reason)?;
        let mut allocation = Allocation::new(units).ok_or_else(|| {
            napi::Error::from_reason("GlobalAlloc/GlobalLock failed for clipboard text")
        })?;
        let owner = Owner::new()
            .ok_or_else(|| napi::Error::from_reason("Could not create clipboard owner window"))?;
        let _clipboard = Clipboard::open(&owner).ok_or_else(|| {
            napi::Error::from_reason("OpenClipboard failed (clipboard may be busy)")
        })?;
        if unsafe { EmptyClipboard() } == 0 {
            return Err(napi::Error::from_reason("EmptyClipboard failed"));
        }
        if !allocation.transfer() {
            return Err(napi::Error::from_reason("SetClipboardData failed"));
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows_sys::Win32::{
            System::{DataExchange::GetClipboardSequenceNumber, Memory::GlobalFlags},
            UI::WindowsAndMessaging::IsWindow,
        };

        #[test]
        fn rejected_nul_does_not_mutate_existing_clipboard() {
            let before = read_text();
            let sequence = unsafe { GetClipboardSequenceNumber() };
            let error = write_text("reject\0before mutation").unwrap_err();
            assert!(error.reason.contains("U+0000"));
            assert_eq!(
                unsafe { GetClipboardSequenceNumber() },
                sequence,
                "invalid input must not even empty an already-empty clipboard"
            );
            assert_eq!(read_text(), before);
        }

        #[test]
        fn hidden_owner_is_destroyed_on_scope_exit() {
            let owner = Owner::new().unwrap();
            let hwnd = owner.0;
            assert_ne!(unsafe { IsWindow(hwnd) }, 0);
            drop(owner);
            assert_eq!(unsafe { IsWindow(hwnd) }, 0);
        }

        #[test]
        fn allocation_is_filled_unlocked_and_owned_until_transfer() {
            let units: Vec<_> = super::super::unicode_text("中文 🎹").unwrap().collect();
            let mut allocation = Allocation::new(units.iter().copied()).unwrap();
            {
                let locked = Locked::new(allocation.0).unwrap();
                assert_eq!(
                    unsafe { std::slice::from_raw_parts(locked.1, units.len()) },
                    units
                );
            }
            assert_eq!(
                unsafe { GlobalFlags(allocation.0) } & 0xff,
                0,
                "GlobalLock count must return to zero before transfer"
            );
            let handle = allocation.0;
            assert!(!allocation.transfer());
            assert_eq!(allocation.0, handle);
            drop(allocation);
            assert_eq!(
                unsafe { GlobalSize(handle) },
                0,
                "failed transfer must free the locally owned allocation"
            );
        }
    }
}

#[cfg(test)]
mod unicode_tests {
    #[test]
    fn rejects_nul_but_keeps_empty_unicode_and_crlf() {
        assert!(super::unicode_text("before\0after").is_err());
        assert_eq!(
            super::unicode_text("").unwrap().collect::<Vec<_>>(),
            vec![0]
        );
        let text = "中文 🎹\r\ne\u{301}";
        let units: Vec<_> = super::unicode_text(text).unwrap().collect();
        assert_eq!(super::decode_unicode_text(&units).as_deref(), Some(text));
    }

    #[test]
    fn bounded_read_rejects_missing_terminator_and_invalid_utf16() {
        assert_eq!(super::decode_unicode_text(&[65, 66]), None);
        assert_eq!(super::decode_unicode_text(&[0xd800, 0]), None);
        assert_eq!(super::decode_unicode_text(&[65, 0, 66]), Some("A".into()));
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
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
