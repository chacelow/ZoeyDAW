//! 原生光标位置/归位。macOS 隐藏由本模块负责;Windows 持续隐藏由 renderer UI owner 负责。
//!
//! macOS 不使用 `CGAssociateMouseAndMouseCursorPosition`:GPUI 的 mouseMove 全部取自
//! `NSEvent.locationInWindow`(绝对位置),断开关联会冻结该位置、让 mouseMove 停发。
//! 只做"隐藏 + 记录锚点 + 松手 warp 回锚点再显示",真实光标不可见地继续移动,
//! gpuix 照常通过 pointer capture 收到 move/up。
//!
//! 锚点取 mouseDown 事件自身携带的窗口坐标,经 `windowPointToScreen` 换算;不在 JS 处理
//! mouseDown 时读当前位置——那时 OS 可能已处理过后续 move。`cursorPosition` 只用于读回验证。
//!
//! 精度:真实鼠标坐标是小数(高分辨率输入),而 warp 只落整数点,因此恢复位置与
//! 锚点最多相差 0.5pt。这是系统接口的下限,不是实现偏差。

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
        // CGWarpMouseCursorPosition 只接受整数点(实测对小数坐标向下取整,
        // 1909.988 会落到 1909)。四舍五入把误差压到 <=0.5pt,即 Retina 上 1 个设备像素。
        // 先 warp 再显示:显示时光标已在锚点,用户看不到任何错位帧。
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

    // ShowCursor is thread-owned. Only renderer's UI thread may hide/show;
    // this standalone bridge intentionally cannot claim to hide on Windows.
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

/// 读取 OS 光标坐标;macOS 为点,Windows 为虚拟桌面物理像素。失败返回 null。
#[napi]
pub fn cursor_position() -> Option<ScreenPoint> {
    platform::position()
}

/// macOS 隐藏 OS 光标。Windows 必须由 renderer UI 线程隐藏,本接口返回 false。
#[napi]
pub fn cursor_hide() -> bool {
    platform::hide()
}

/// 把光标放回 `point`;macOS 同时显示,Windows 显示由 renderer UI owner 负责。
#[napi]
pub fn cursor_restore(point: ScreenPoint) -> bool {
    platform::restore(point)
}
