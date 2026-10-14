import { beforeEach, describe, expect, mock, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../shared/theme/ThemeProvider"
import { DragPadNumber } from "./DragPadNumber"

// Real native-cursor calls spawn `osascript` and hide/warp/show the host's
// actual OS cursor (see native-cursor.ts). A permanent test suite must not
// have that side effect on every `bun test` run (confirmed empirically:
// without this mock, these tests really did spawn osascript and touch the
// real cursor). `mock.module` patches the live binding `DragPadNumber`
// already imported above resolves to
// (https://bun.com/docs/test/mocks: "Overriding Already Imported Modules"),
// so this stays a static import instead of a runtime-selected one.
const captureCursorPosition = mock(() => ({ x: 111, y: 222 }))
const hideCursor = mock(() => {})
const restoreCursor = mock((_point: { x: number; y: number }) => {})
mock.module("./native-cursor", () => ({ captureCursorPosition, hideCursor, restoreCursor }))

beforeEach(() => {
  captureCursorPosition.mockClear()
  hideCursor.mockClear()
  restoreCursor.mockClear()
})

function mount(initial = 120, min = 0, max = 300, step = 1) {
  let latest = initial
  const root = createTestRoot({ width: 640, height: 320 })
  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <ThemeProvider>
        <DragPadNumber
          label="Value"
          testId="pad"
          value={value}
          min={min}
          max={max}
          step={step}
          defaultValue={120}
          onChange={next => {
            latest = next
            setValue(next)
          }}
        />
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  const element = root.renderer.findByTestId("pad")
  if (!element) throw new Error("DragPadNumber not mounted")
  const bounds = root.renderer.getElementBounds(element.id)
  if (!bounds) throw new Error("DragPadNumber not painted")
  return {
    ...root,
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    value: () => latest,
  }
}

describe("DragPadNumber native interactions", () => {
  test("relative drag keeps tracking outside the control and ignores horizontal distance", () => {
    const a = mount()
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    a.renderer.nativeSimulateMouseMove(a.x + 180, a.y - 40, 0)
    a.renderer.nativeSimulateMouseUp(a.x + 180, a.y - 40)
    expect(a.value()).toBe(130)
    a.unmount()
  })

  test("subdividing a drag into more move events cannot change its result", () => {
    const a = mount()
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    for (let distance = 4; distance <= 40; distance += 4) {
      a.renderer.nativeSimulateMouseMove(a.x, a.y - distance, 0)
    }
    a.renderer.nativeSimulateMouseUp(a.x, a.y - 40)
    expect(a.value()).toBe(130)
    a.unmount()
  })

  test("small ranges use the same steps per vertical pixel", () => {
    const a = mount(0, -1, 1, 0.01)
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 40, 0)
    a.renderer.nativeSimulateMouseUp(a.x, a.y - 40)
    expect(a.value()).toBeCloseTo(0.1)
    a.unmount()
  })

  test("wheel adjusts only the hovered pad, without a preceding press", () => {
    const a = mount()
    a.renderer.nativeSimulateScrollWheel(a.x + 300, a.y + 100, 0, 16)
    expect(a.value()).toBe(120)
    a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, 16)
    expect(a.value()).not.toBe(120)
    a.unmount()
  })

  test("click preserves value; typing updates it live; Enter finishes editing", () => {
    const a = mount()
    a.renderer.nativeSimulateClick(a.x, a.y)
    expect(a.value()).toBe(120)
    expect(a.renderer.findByType("input")).toHaveLength(0)
    a.renderer.simulateKeystrokes("9")
    expect(a.renderer.findByType("input")).toHaveLength(1)
    expect(a.value()).toBe(9)
    a.renderer.simulateKeystrokes("9")
    expect(a.value()).toBe(99)
    a.renderer.simulateKeystrokes("enter")
    expect(a.renderer.findByType("input")).toHaveLength(0)
    expect(a.value()).toBe(99)
    a.unmount()
  })

  test("Escape cancels the live editing transaction", () => {
    const a = mount()
    a.renderer.nativeSimulateClick(a.x, a.y)
    a.renderer.simulateKeystrokes("9")
    a.renderer.simulateKeystrokes("9")
    expect(a.value()).toBe(99)
    a.renderer.simulateKeystrokes("escape")
    expect(a.value()).toBe(120)
    expect(a.renderer.findByType("input")).toHaveLength(0)
    a.unmount()
  })

  test("icon and control width persist across default, pre-edit and editing", () => {
    const a = mount()
    const pad = a.renderer.findByTestId("pad")
    if (!pad) throw new Error("Missing pad")
    const original = a.renderer.getElementBounds(pad.id)
    expect(a.renderer.findByType("svg")).toHaveLength(1)
    a.renderer.nativeSimulateClick(a.x, a.y)
    expect(a.renderer.findByType("svg")).toHaveLength(1)
    a.renderer.simulateKeystrokes("1")
    expect(a.renderer.findByType("svg")).toHaveLength(1)
    const editing = a.renderer.findByTestId("pad")
    if (!editing) throw new Error("Missing editing shell")
    expect(a.renderer.getElementBounds(editing.id)?.width).toBe(original?.width)
    a.unmount()
  })
})

describe("DragPadNumber native-cursor wiring", () => {
  test("a plain click captures a cursor anchor but never hides or restores the cursor", () => {
    const a = mount()
    a.renderer.nativeSimulateClick(a.x, a.y)
    expect(captureCursorPosition).toHaveBeenCalledTimes(1)
    expect(hideCursor).not.toHaveBeenCalled()
    expect(restoreCursor).not.toHaveBeenCalled()
    a.unmount()
  })

  test("wheel adjustment never hides the cursor", () => {
    const a = mount()
    a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, 16)
    expect(captureCursorPosition).not.toHaveBeenCalled()
    expect(hideCursor).not.toHaveBeenCalled()
    a.unmount()
  })

  test("a real drag hides the cursor once confirmed and restores it to the mouseDown-time anchor on release", () => {
    const a = mount()
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    expect(captureCursorPosition).toHaveBeenCalledTimes(1)
    expect(hideCursor).not.toHaveBeenCalled()
    a.renderer.nativeSimulateMouseMove(a.x + 180, a.y - 40, 0)
    expect(hideCursor).toHaveBeenCalledTimes(1)
    expect(restoreCursor).not.toHaveBeenCalled()
    a.renderer.nativeSimulateMouseUp(a.x + 180, a.y - 40)
    expect(restoreCursor).toHaveBeenCalledTimes(1)
    // The anchor passed to restore is whatever was captured at mouseDown,
    // not a value derived from the drag's end position — this is the exact
    // bug this design fixes (see native-cursor.ts's doc comment): capturing
    // lazily inside the move handler anchors to a point already partway
    // through the drag instead of the true press pixel.
    expect(restoreCursor).toHaveBeenCalledWith({ x: 111, y: 222 })
    a.unmount()
  })
})
