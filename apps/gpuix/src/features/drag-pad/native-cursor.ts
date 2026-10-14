/**
 * Native OS cursor hide/restore for the drag gesture.
 *
 * gpuix's own JS API has no cursor hide/warp/global-capture surface (see
 * `docs/research/gpuix-rendering-alternatives.md`'s "无限相对移动、隐藏、原位恢复"
 * row). But gpuix apps are real native processes, not a browser WebView, so
 * the fix does not need gpuix to expose anything: this calls macOS's own
 * CoreGraphics cursor APIs directly.
 *
 * This deliberately does NOT use `CGAssociateMouseAndMouseCursorPosition`
 * (the usual FPS-style "pointer lock" trick of decoupling the OS cursor from
 * hardware movement and reading raw deltas instead). Checked against GPUI's
 * own macOS event source
 * (https://github.com/zed-industries/zed/blob/main/crates/gpui_macos/src/events.rs,
 * `NSMouseMoved` branch): every mouse-move event GPUI delivers is built from
 * `NSEvent.locationInWindow()`, the absolute cursor position — there is no
 * raw-delta code path. Disassociating the cursor freezes that position, so
 * it would silently stop every `mouseMove` event from firing during the
 * drag, breaking the interaction instead of fixing it.
 *
 * What actually works: only hide the cursor (pure visibility, does not
 * touch position tracking) once a drag is confirmed, let the real OS
 * cursor keep moving normally and invisibly — gpuix keeps receiving real
 * `mouseMove`/`mouseUp` via its already-working pointer capture (see
 * `useDragPad.ts`'s own header comment) — then warp the real cursor back
 * to the exact press-time anchor and show it again, in that order, so the
 * user never sees it move and never sees a final-frame jump. The anchor
 * must be captured at `mouseDown`, before the click-vs-drag threshold
 * resolves — see `captureCursorPosition`'s doc comment for why.
 *
 * Implemented via `osascript -l JavaScript` (JXA) instead of `bun:ffi`:
 * `CGEventGetLocation`/`CGPointMake` return/take a `CGPoint` *by value*, and
 * Bun's `FFIType` has no `struct` variant to marshal that, so a raw FFI call
 * reading that return would read garbage. JXA's ObjC bridge marshals these
 * structs correctly. The tradeoff is real process-spawn latency
 * (double-digit milliseconds), paid synchronously on every `mouseDown`
 * (capture) and at most once more on release (restore) — never per
 * `mouseMove` frame, since the relative-drag value math is untouched and
 * keeps running off gpuix's own events. A plain click pays the capture
 * cost too even though it never hides anything, because the anchor must
 * be read before we know whether the press will become a drag. macOS
 * only: every call is a no-op elsewhere.
 */
import { spawnSync } from "node:child_process"

export interface ScreenPoint {
  x: number
  y: number
}

function runJxaSync(script: string): string | null {
  if (process.platform !== "darwin") {
    return null
  }
  const result = spawnSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
    encoding: "utf-8",
  })
  if (result.status !== 0) {
    return null
  }
  return result.stdout.trim()
}

/**
 * Captures the real screen position of the OS cursor without touching its
 * visibility. Call this at `mouseDown`, not lazily inside the first
 * qualifying `mouseMove` — by the time a move event clears the
 * click-vs-drag threshold, the real cursor has already travelled past the
 * true press point (confirmed empirically: capturing lazily anchored to a
 * point partway through the drag instead of the actual start). `mouseDown`
 * is the one moment position is guaranteed stationary.
 */
export function captureCursorPosition(): ScreenPoint | null {
  const output = runJxaSync(`
    ObjC.import("CoreGraphics");
    var loc = $.CGEventGetLocation($.CGEventCreate($()));
    loc.x + "," + loc.y;
  `)
  if (!output) {
    return null
  }
  const [x, y] = output.split(",").map(Number)
  if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) {
    return null
  }
  return { x, y }
}

/** Hides the OS cursor. Call once the click-vs-drag threshold confirms a real drag; the anchor to restore to was already captured at `mouseDown`. */
export function hideCursor(): void {
  runJxaSync(`
    ObjC.import("CoreGraphics");
    $.CGDisplayHideCursor($.CGMainDisplayID());
  `)
}

/** Warps the real cursor back to `point`, then shows it — in that order, so there is no visible frame at the wrong position. */
export function restoreCursor(point: ScreenPoint): void {
  runJxaSync(`
    ObjC.import("CoreGraphics");
    $.CGWarpMouseCursorPosition($.CGPointMake(${point.x}, ${point.y}));
    $.CGDisplayShowCursor($.CGMainDisplayID());
  `)
}
