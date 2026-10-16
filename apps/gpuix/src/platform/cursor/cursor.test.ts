import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { currentCursorPosition, nativeCursorLock } from "."

// Real napi module; only read-only calls, so the host cursor is never hidden or moved.
// Depends on the test renderer's window being offscreen and never key or main
// (vendor packages/native/src/test_renderer.rs:268), so no window anchors a press.
test("without a key or main window a press yields no anchor, even though the live cursor is readable", () => {
  const live = currentCursorPosition()
  if (live === null)
    throw new Error(
      "cursorPosition() returned null: this host cannot read the OS cursor, so falling back to the live position would go undetected"
    )
  const root = createTestRoot({ width: 200, height: 120 })
  root.render(null)
  expect(nativeCursorLock.capture({ x: 1, y: 2 })).toBeNull()
  root.unmount()
})
