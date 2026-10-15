//! 窗口坐标 → 全局屏幕坐标,供光标锁定取"按下事件本身"的位置。
//!
//! gpuix 的 mouse 事件 `x/y` 来自 GPUI:`(locationInWindow.x, contentHeight - locationInWindow.y)`,
//! 在事件发生时刻计算,单位是点(pt),左上原点。这里做它的精确逆变换,再从 AppKit 全局坐标
//! (左下原点,主屏底边为 y=0)翻到 CoreGraphics 全局坐标(左上原点,主屏顶边为 y=0),
//! 即 `cursorRestore`/`CGWarpMouseCursorPosition` 使用的坐标系。
//!
//! 全程是点:locationInWindow、NSWindow.frame、CGDisplay bounds 都与 backing scale 无关,
//! 所以换算不接收缩放因子。

use crate::cursor::ScreenPoint;
use napi_derive::napi;

/// 窗口内容区左上原点的点坐标,即 gpuix 鼠标事件的 `x/y`。
#[napi(object)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowPoint {
    pub x: f64,
    pub y: f64,
}

/// 窗口在 AppKit 全局坐标里的几何:frame 左下角与 GPUI 翻转 y 时使用的内容区高度。
#[derive(Clone, Copy, Debug, PartialEq)]
struct WindowGeometry {
    frame_x: f64,
    frame_y: f64,
    content_height: f64,
}

/// `primary_height` 是 CG 全局原点所在显示器(主屏)的高度,AppKit 与 CG 的 y 以它为轴互翻。
fn window_to_cg(window: WindowGeometry, primary_height: f64, point: WindowPoint) -> ScreenPoint {
    let appkit_y = window.frame_y + window.content_height - point.y;
    ScreenPoint { x: window.frame_x + point.x, y: primary_height - appkit_y }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::WindowGeometry;
    use core_graphics::display::CGDisplay;
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;

    extern "C" {
        /// AppKit 全局 `NSApp`:gpuix 创建 GPUI 应用前为 nil。
        static NSApp: *const NSApplication;
    }

    /// 当前 key 窗口(没有时取 main 窗口)。非主线程、应用未创建或没有窗口返回 None。
    pub fn active_window() -> Option<WindowGeometry> {
        // NSApplication 只能在主线程访问;bun --hot 在主线程调用 napi(见 app_state.rs 的实测),
        // Worker 线程拿不到 marker,直接返回 None,调用方不锁光标。
        MainThreadMarker::new()?;
        // 不用 sharedApplication:应用未创建时它会造出普通 NSApplication,之后 GPUI 初始化
        // panic(见 app_state.rs)。读全局指针,nil 即 None。
        // SAFETY: 主线程上读取 AppKit 导出的全局对象指针;非 nil 时由 AppKit 持有,本调用内有效。
        let app = unsafe { NSApp.as_ref() }?;
        let window = app.keyWindow().or_else(|| app.mainWindow())?;
        let frame = window.frame();
        let content_height = window.contentView()?.frame().size.height;
        Some(WindowGeometry { frame_x: frame.origin.x, frame_y: frame.origin.y, content_height })
    }

    pub fn primary_height() -> f64 {
        CGDisplay::main().bounds().size.height
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::WindowGeometry;
    pub fn active_window() -> Option<WindowGeometry> { None }
    pub fn primary_height() -> f64 { 0.0 }
}

/// 把当前 key 窗口里的事件坐标换算成 CG 全局屏幕坐标。没有可用窗口或非 macOS 返回 null。
#[napi]
pub fn window_point_to_screen(point: WindowPoint) -> Option<ScreenPoint> {
    let window = platform::active_window()?;
    Some(window_to_cg(window, platform::primary_height(), point))
}

#[cfg(test)]
mod tests {
    use super::{window_to_cg, WindowGeometry, WindowPoint};
    use crate::cursor::ScreenPoint;

    const PRIMARY_HEIGHT: f64 = 1117.0;

    fn window(frame_x: f64, frame_y: f64, content_height: f64) -> WindowGeometry {
        WindowGeometry { frame_x, frame_y, content_height }
    }

    #[test]
    fn flips_bottom_left_window_origin_to_top_left_screen() {
        // 窗口底边离主屏底边 117pt,内容区高 800:内容区顶边在 CG y=200。
        let point = window_to_cg(window(100.0, 117.0, 800.0), PRIMARY_HEIGHT, WindowPoint { x: 0.0, y: 0.0 });
        assert_eq!(point, ScreenPoint { x: 100.0, y: 200.0 });
        let inside = window_to_cg(window(100.0, 117.0, 800.0), PRIMARY_HEIGHT, WindowPoint { x: 40.5, y: 64.25 });
        assert_eq!(inside, ScreenPoint { x: 140.5, y: 264.25 });
    }

    #[test]
    fn content_height_is_the_flip_axis_not_the_frame_height() {
        // 有标题栏时 frame 比内容区高;GPUI 以内容区高度翻转,逆变换必须用同一高度。
        let point = window_to_cg(window(0.0, 0.0, 772.0), PRIMARY_HEIGHT, WindowPoint { x: 10.0, y: 772.0 });
        assert_eq!(point, ScreenPoint { x: 10.0, y: PRIMARY_HEIGHT });
    }

    #[test]
    fn secondary_display_left_of_primary_yields_negative_x() {
        let point = window_to_cg(window(-1800.0, 300.0, 600.0), PRIMARY_HEIGHT, WindowPoint { x: 50.0, y: 20.0 });
        assert_eq!(point, ScreenPoint { x: -1750.0, y: 237.0 });
    }

    #[test]
    fn secondary_display_above_primary_yields_negative_y() {
        // AppKit y 大于主屏高度即位于主屏上方,CG y 为负。
        let point = window_to_cg(window(200.0, 1400.0, 500.0), PRIMARY_HEIGHT, WindowPoint { x: 0.0, y: 100.0 });
        assert_eq!(point, ScreenPoint { x: 200.0, y: -683.0 });
    }

    #[test]
    fn retina_scale_does_not_enter_the_conversion() {
        // 2x 屏上 1pt = 2 设备像素,但事件、frame、CG 全局坐标都以点计;
        // 同一窗口几何无论所在屏缩放如何,结果相同,换算签名里也没有 scale。
        let geometry = window(1512.0, 0.0, 982.0);
        let event = WindowPoint { x: 300.0, y: 400.0 };
        let point = window_to_cg(geometry, PRIMARY_HEIGHT, event);
        assert_eq!(point, ScreenPoint { x: 1812.0, y: PRIMARY_HEIGHT - 582.0 });
        assert_eq!(point.x - geometry.frame_x, event.x);
    }
}
