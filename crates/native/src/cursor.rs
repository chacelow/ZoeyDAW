use napi_derive::napi;

#[napi(object)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScreenPoint {
    pub x: f64,
    pub y: f64,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::ScreenPoint;
    use core_graphics::display::CGDisplay;
    use core_graphics::event::CGEvent;
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    use core_graphics::geometry::CGPoint;

    pub fn position() -> Option<ScreenPoint> {
        let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
        let location = CGEvent::new(source).ok()?.location();
        Some(ScreenPoint {
            x: location.x,
            y: location.y,
        })
    }

    pub fn hide() -> bool {
        CGDisplay::main().hide_cursor().is_ok()
    }

    pub fn restore(point: ScreenPoint) -> bool {
        let target = CGPoint::new(point.x.round(), point.y.round());
        let warped = CGDisplay::warp_mouse_cursor_position(target).is_ok();
        let shown = CGDisplay::main().show_cursor().is_ok();
        warped && shown
    }
}

#[cfg(any(windows, test))]
pub(crate) fn physical_coordinate(value: f64) -> Option<i32> {
    let rounded = value.round();
    (rounded.is_finite() && rounded >= i32::MIN as f64 && rounded <= i32::MAX as f64)
        .then_some(rounded as i32)
}

#[cfg(windows)]
mod platform {
    use super::{physical_coordinate, ScreenPoint};
    use windows_sys::Win32::{
        Foundation::POINT,
        UI::WindowsAndMessaging::{GetPhysicalCursorPos, SetPhysicalCursorPos},
    };

    pub fn position() -> Option<ScreenPoint> {
        let mut point = POINT { x: 0, y: 0 };
        (unsafe { GetPhysicalCursorPos(&mut point) } != 0).then_some(ScreenPoint {
            x: point.x as f64,
            y: point.y as f64,
        })
    }

    pub fn hide() -> bool {
        false
    }

    pub fn restore(point: ScreenPoint) -> bool {
        let (Some(x), Some(y)) = (physical_coordinate(point.x), physical_coordinate(point.y))
        else {
            return false;
        };
        unsafe { SetPhysicalCursorPos(x, y) != 0 }
    }
}

#[cfg(test)]
mod physical_tests {
    use super::physical_coordinate;

    #[test]
    fn rounds_physical_pixels_on_both_sides_of_virtual_desktop_origin() {
        assert_eq!(physical_coordinate(12.5), Some(13));
        assert_eq!(physical_coordinate(-12.5), Some(-13));
        assert_eq!(physical_coordinate(-0.1), Some(0));
        assert_eq!(physical_coordinate(i32::MIN as f64), Some(i32::MIN));
        assert_eq!(physical_coordinate(i32::MAX as f64), Some(i32::MAX));
    }

    #[test]
    fn invalid_or_out_of_range_coordinates_never_saturate_to_another_pixel() {
        for value in [
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
            i32::MAX as f64 + 1.0,
            i32::MIN as f64 - 1.0,
        ] {
            assert_eq!(physical_coordinate(value), None);
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    use super::ScreenPoint;
    pub fn position() -> Option<ScreenPoint> {
        None
    }
    pub fn hide() -> bool {
        false
    }
    pub fn restore(_: ScreenPoint) -> bool {
        false
    }
}

#[napi]
pub fn cursor_position() -> Option<ScreenPoint> {
    platform::position()
}

#[napi]
pub fn cursor_hide() -> bool {
    platform::hide()
}

#[napi]
pub fn cursor_restore(point: ScreenPoint) -> bool {
    platform::restore(point)
}
