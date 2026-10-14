import { describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../shared/theme/ThemeProvider"
import { ClipTimeline } from "./components/ClipTimeline"

function mount() {
  const root = createTestRoot({ width: 1040, height: 480 })
  root.render(
    <ThemeProvider>
      <ClipTimeline />
    </ThemeProvider>
  )
  root.renderer.flush()
  function boundsOf(testId: string) {
    const element = root.renderer.findByTestId(testId)
    if (!element) return null
    return root.renderer.getElementBounds(element.id)
  }
  return { ...root, boundsOf }
}

describe("ClipTimeline native drag, resize and culling", () => {
  test("dragging a clip's body moves it by the pointer delta without changing its width", () => {
    const a = mount()
    const before = a.boundsOf("clip-clip-drums-1")
    if (!before) throw new Error("clip-drums-1 not mounted")
    const originX = before.x + before.width / 2
    const originY = before.y + before.height / 2
    a.renderer.nativeSimulateMouseDown(originX, originY)
    a.renderer.nativeSimulateMouseMove(originX + 72, originY, 0)
    a.renderer.nativeSimulateMouseUp(originX + 72, originY)
    const after = a.boundsOf("clip-clip-drums-1")
    if (!after) throw new Error("clip-drums-1 unmounted after drag")
    expect(after.x - before.x).toBe(72)
    expect(after.width).toBe(before.width)
    a.unmount()
  })

  test("the right resize handle changes only the width", () => {
    const a = mount()
    const before = a.boundsOf("clip-clip-drums-1-resize-right")
    if (!before) throw new Error("resize-right handle not mounted")
    const clipBefore = a.boundsOf("clip-clip-drums-1")
    if (!clipBefore) throw new Error("clip-drums-1 not mounted")
    const originX = before.x + before.width / 2
    const originY = before.y + before.height / 2
    a.renderer.nativeSimulateMouseDown(originX, originY)
    a.renderer.nativeSimulateMouseMove(originX + 48, originY, 0)
    a.renderer.nativeSimulateMouseUp(originX + 48, originY)
    const clipAfter = a.boundsOf("clip-clip-drums-1")
    if (!clipAfter) throw new Error("clip-drums-1 unmounted after resize")
    expect(clipAfter.width - clipBefore.width).toBe(48)
    expect(clipAfter.x).toBe(clipBefore.x)
    a.unmount()
  })

  test("the left resize handle moves the left edge and preserves the right edge", () => {
    const a = mount()
    const before = a.boundsOf("clip-clip-drums-1-resize-left")
    if (!before) throw new Error("resize-left handle not mounted")
    const clipBefore = a.boundsOf("clip-clip-drums-1")
    if (!clipBefore) throw new Error("clip-drums-1 not mounted")
    const originX = before.x + before.width / 2
    const originY = before.y + before.height / 2
    a.renderer.nativeSimulateMouseDown(originX, originY)
    a.renderer.nativeSimulateMouseMove(originX + 24, originY, 0)
    a.renderer.nativeSimulateMouseUp(originX + 24, originY)
    const clipAfter = a.boundsOf("clip-clip-drums-1")
    if (!clipAfter) throw new Error("clip-drums-1 unmounted after resize")
    expect(clipAfter.x - clipBefore.x).toBe(24)
    expect(clipAfter.x + clipAfter.width).toBe(clipBefore.x + clipBefore.width)
    a.unmount()
  })

  test("resizing cannot shrink a clip below the minimum length", () => {
    const a = mount()
    const handle = a.boundsOf("clip-clip-drums-1-resize-right")
    if (!handle) throw new Error("resize-right handle not mounted")
    const originX = handle.x + handle.width / 2
    const originY = handle.y + handle.height / 2
    a.renderer.nativeSimulateMouseDown(originX, originY)
    a.renderer.nativeSimulateMouseMove(originX - 1000, originY, 0)
    a.renderer.nativeSimulateMouseUp(originX - 1000, originY)
    const clipAfter = a.boundsOf("clip-clip-drums-1")
    if (!clipAfter) throw new Error("clip-drums-1 unmounted after clamped resize")
    // MIN_CLIP_LENGTH_BARS (0.5) * PX_PER_BAR (24)
    expect(clipAfter.width).toBe(12)
    a.unmount()
  })

  test("clips outside the visible range are never mounted", () => {
    const a = mount()
    expect(a.boundsOf("clip-clip-drums-1")).not.toBeNull()
    // clip-drums-4 starts at bar 120, far past the initial viewport.
    expect(a.boundsOf("clip-clip-drums-4")).toBeNull()
    a.unmount()
  })
})
