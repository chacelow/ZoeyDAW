/**
 * DragPad 的原生光标隐藏/恢复。实现在 Rust(`crates/native/src/cursor.rs`,经 napi 暴露),
 * 这里只是适配到 `useDragPad` 使用的三个函数。
 *
 * 不使用 `CGAssociateMouseAndMouseCursorPosition`:GPUI 的 mouseMove 取自
 * `NSEvent.locationInWindow` 绝对位置,断开关联会冻结 mouseMove。实际方案是
 * mouseDown 抓锚点 → 确认拖动后隐藏 → 松手先 warp 回锚点再显示。
 * 锚点必须在 mouseDown 抓取:延后到越过点击阈值的 mouseMove 会锚到拖动中途。
 *
 * 非 macOS 或调用失败时 `captureCursorPosition` 返回 null,调用方跳过隐藏与恢复。
 */
import { cursorHide, cursorPosition, cursorRestore } from "@zoeydaw/native"
import type { ScreenPoint } from "@zoeydaw/native"

export type { ScreenPoint }

export function captureCursorPosition(): ScreenPoint | null {
  return cursorPosition()
}

export function hideCursor(): void {
  cursorHide()
}

export function restoreCursor(point: ScreenPoint): void {
  cursorRestore(point)
}
