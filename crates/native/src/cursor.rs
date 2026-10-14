//! 原生光标锁定:拖动数值时隐藏光标、松手后精确放回按下像素。
//!
//! 不使用 `CGAssociateMouseAndMouseCursorPosition`:GPUI 的 mouseMove 全部取自
//! `NSEvent.locationInWindow`(绝对位置),断开关联会冻结该位置、让 mouseMove 停发。
//! 只做"隐藏 + 记录锚点 + 松手 warp 回锚点再显示",真实光标不可见地继续移动,
//! gpuix 照常通过 pointer capture 收到 move/up。
//!
//! 锚点必须在 mouseDown 抓取(此刻位置静止),不能延后到越过拖动阈值的 mouseMove。
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
        Some(ScreenPoint { x: location.x, y: location.y })
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

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::ScreenPoint;
    pub fn position() -> Option<ScreenPoint> { None }
    pub fn hide() -> bool { false }
    pub fn restore(_: ScreenPoint) -> bool { false }
}

/// 读取 OS 光标的屏幕坐标,不改变可见性。非 macOS 或失败返回 null。
#[napi]
pub fn cursor_position() -> Option<ScreenPoint> {
    platform::position()
}

/// 隐藏 OS 光标。确认进入拖动后调用;锚点应已在 mouseDown 由 `cursorPosition` 取得。
#[napi]
pub fn cursor_hide() -> bool {
    platform::hide()
}

/// 先把光标放回 `point`,再显示。
#[napi]
pub fn cursor_restore(point: ScreenPoint) -> bool {
    platform::restore(point)
}
