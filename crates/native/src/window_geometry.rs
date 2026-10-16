use crate::cursor::ScreenPoint;
use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowPoint {
    pub x: f64,
    pub y: f64,
}

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy, Debug, PartialEq)]
struct WindowGeometry {
    frame_x: f64,
    frame_y: f64,
    content_height: f64,
}

#[cfg(any(target_os = "macos", test))]
fn window_to_cg(window: WindowGeometry, primary_height: f64, point: WindowPoint) -> ScreenPoint {
    let appkit_y = window.frame_y + window.content_height - point.y;
    ScreenPoint {
        x: window.frame_x + point.x,
        y: primary_height - appkit_y,
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::WindowGeometry;
    use core_graphics::display::CGDisplay;
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;

    extern "C" {
        static mut NSApp: *const NSApplication;
    }

    pub fn active_window() -> Option<(WindowGeometry, f64)> {
        MainThreadMarker::new()?;
        let app = unsafe { core::ptr::addr_of!(NSApp).read().as_ref() }?;
        let window = app.keyWindow().or_else(|| app.mainWindow())?;
        let frame = window.frame();
        let content_height = window.contentView()?.frame().size.height;
        let geometry = WindowGeometry {
            frame_x: frame.origin.x,
            frame_y: frame.origin.y,
            content_height,
        };
        Some((geometry, CGDisplay::main().bounds().size.height))
    }

    pub fn to_screen(point: super::WindowPoint) -> Option<crate::cursor::ScreenPoint> {
        let (window, primary_height) = active_window()?;
        Some(super::window_to_cg(window, primary_height, point))
    }
}

#[cfg(any(windows, test))]
fn dip_to_physical(value: f64, dpi: u32) -> Option<i32> {
    if dpi == 0 {
        return None;
    }
    crate::cursor::physical_coordinate(value * f64::from(dpi) / 96.0)
}

#[cfg(any(windows, test))]
fn window_to_physical(origin: (i32, i32), dpi: u32, point: WindowPoint) -> Option<ScreenPoint> {
    let x = origin.0.checked_add(dip_to_physical(point.x, dpi)?)?;
    let y = origin.1.checked_add(dip_to_physical(point.y, dpi)?)?;
    Some(ScreenPoint {
        x: f64::from(x),
        y: f64::from(y),
    })
}

#[cfg(windows)]
mod platform {
    use super::{window_to_physical, ScreenPoint, WindowPoint};
    use windows_sys::Win32::{
        Foundation::POINT,
        Graphics::Gdi::ClientToScreen,
        System::Threading::GetCurrentProcessId,
        UI::{
            HiDpi::{
                GetDpiForWindow, GetWindowDpiAwarenessContext, SetThreadDpiAwarenessContext,
                DPI_AWARENESS_CONTEXT,
            },
            WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
        },
    };

    struct DpiContext(DPI_AWARENESS_CONTEXT);
    impl Drop for DpiContext {
        fn drop(&mut self) {
            unsafe {
                SetThreadDpiAwarenessContext(self.0);
            }
        }
    }

    pub fn to_screen(point: WindowPoint) -> Option<ScreenPoint> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut pid);
        }
        if pid != unsafe { GetCurrentProcessId() } {
            return None;
        }
        let context = unsafe { GetWindowDpiAwarenessContext(hwnd) };
        if context.is_null() {
            return None;
        }
        let previous = unsafe { SetThreadDpiAwarenessContext(context) };
        if previous.is_null() {
            return None;
        }
        let _restore_context = DpiContext(previous);
        let dpi = unsafe { GetDpiForWindow(hwnd) };
        let mut origin = POINT { x: 0, y: 0 };
        if unsafe { ClientToScreen(hwnd, &mut origin) } == 0 {
            return None;
        }
        window_to_physical((origin.x, origin.y), dpi, point)
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn to_screen(_: super::WindowPoint) -> Option<crate::cursor::ScreenPoint> {
        None
    }
}

#[napi]
pub fn window_point_to_screen(point: WindowPoint) -> Option<ScreenPoint> {
    platform::to_screen(point)
}

#[cfg(test)]
mod tests {
    use super::{window_to_cg, WindowGeometry, WindowPoint};
    use crate::cursor::ScreenPoint;

    const PRIMARY_HEIGHT: f64 = 1117.0;

    fn window(frame_x: f64, frame_y: f64, content_height: f64) -> WindowGeometry {
        WindowGeometry {
            frame_x,
            frame_y,
            content_height,
        }
    }

    #[test]
    fn flips_bottom_left_window_origin_to_top_left_screen() {
        let point = window_to_cg(
            window(100.0, 117.0, 800.0),
            PRIMARY_HEIGHT,
            WindowPoint { x: 0.0, y: 0.0 },
        );
        assert_eq!(point, ScreenPoint { x: 100.0, y: 200.0 });
        let inside = window_to_cg(
            window(100.0, 117.0, 800.0),
            PRIMARY_HEIGHT,
            WindowPoint { x: 40.5, y: 64.25 },
        );
        assert_eq!(
            inside,
            ScreenPoint {
                x: 140.5,
                y: 264.25
            }
        );
    }

    #[test]
    fn content_height_is_the_flip_axis_not_the_frame_height() {
        let point = window_to_cg(
            window(0.0, 0.0, 772.0),
            PRIMARY_HEIGHT,
            WindowPoint { x: 10.0, y: 772.0 },
        );
        assert_eq!(
            point,
            ScreenPoint {
                x: 10.0,
                y: PRIMARY_HEIGHT
            }
        );
    }

    #[test]
    fn secondary_display_left_of_primary_yields_negative_x() {
        let point = window_to_cg(
            window(-1800.0, 300.0, 600.0),
            PRIMARY_HEIGHT,
            WindowPoint { x: 50.0, y: 20.0 },
        );
        assert_eq!(
            point,
            ScreenPoint {
                x: -1750.0,
                y: 237.0
            }
        );
    }

    #[test]
    fn secondary_display_above_primary_yields_negative_y() {
        let point = window_to_cg(
            window(200.0, 1400.0, 500.0),
            PRIMARY_HEIGHT,
            WindowPoint { x: 0.0, y: 100.0 },
        );
        assert_eq!(
            point,
            ScreenPoint {
                x: 200.0,
                y: -683.0
            }
        );
    }

    #[test]
    fn retina_scale_does_not_enter_the_conversion() {
        let geometry = window(1512.0, 0.0, 982.0);
        let event = WindowPoint { x: 300.0, y: 400.0 };
        let point = window_to_cg(geometry, PRIMARY_HEIGHT, event);
        assert_eq!(
            point,
            ScreenPoint {
                x: 1812.0,
                y: PRIMARY_HEIGHT - 582.0
            }
        );
        assert_eq!(point.x - geometry.frame_x, event.x);
    }

    #[test]
    fn windows_dips_round_to_physical_pixels_and_validate_input() {
        assert_eq!(super::dip_to_physical(10.5, 96), Some(11));
        assert_eq!(super::dip_to_physical(-10.5, 144), Some(-16));
        assert_eq!(super::dip_to_physical(10.25, 192), Some(21));
        assert_eq!(super::dip_to_physical(1.0, 0), None);
        assert_eq!(super::dip_to_physical(f64::NAN, 96), None);
        assert_eq!(super::dip_to_physical(f64::INFINITY, 96), None);
        assert_eq!(super::dip_to_physical(i32::MAX as f64, 192), None);
    }

    #[test]
    fn windows_screen_origin_preserves_negative_monitors_and_rejects_overflow() {
        assert_eq!(
            super::window_to_physical((-1920, -1080), 144, WindowPoint { x: 10.5, y: 20.5 }),
            Some(ScreenPoint {
                x: -1904.0,
                y: -1049.0
            })
        );
        assert_eq!(
            super::window_to_physical(
                (100, 0),
                96,
                WindowPoint {
                    x: i32::MAX as f64,
                    y: 0.0
                }
            ),
            None
        );
        assert_eq!(
            super::window_to_physical(
                (0, -100),
                96,
                WindowPoint {
                    x: 0.0,
                    y: i32::MIN as f64
                }
            ),
            None
        );
    }
}
