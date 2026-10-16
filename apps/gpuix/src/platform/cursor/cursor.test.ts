import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { createNativeCursorLock, currentCursorPosition } from "."

test("without an active application window a press yields no anchor, even though the live cursor is readable", () => {
  const live = currentCursorPosition()
  if (live === null)
    throw new Error(
      "cursorPosition() returned null: this host cannot read the OS cursor, so falling back to the live position would go undetected"
    )
  const root = createTestRoot({ width: 200, height: 120 })
  try {
    root.render(null)
    const cursorLock = createNativeCursorLock(root.renderer)
    expect(cursorLock.capture({ x: 1, y: 2 })).toBeNull()
    if (process.platform === "win32") {
      expect(() => cursorLock.hide()).toThrow("Renderer does not support Windows cursor dragging")
      expect(() => cursorLock.restore(live)).toThrow(
        "Renderer does not support Windows cursor dragging"
      )
    }
  } finally {
    root.unmount()
  }
})
