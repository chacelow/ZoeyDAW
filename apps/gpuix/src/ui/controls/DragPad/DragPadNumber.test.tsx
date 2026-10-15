import { describe, expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { DragPadNumber } from "./DragPadNumber"
import { readOuterBounds } from "../useMeasuredTextWidth"

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
  const bounds = readOuterBounds(root.renderer, root.renderer.getElement(element.id))
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
    const original = readOuterBounds(a.renderer, a.renderer.getElement(pad.id))
    expect(a.renderer.findByType("svg")).toHaveLength(1)
    a.renderer.nativeSimulateClick(a.x, a.y)
    expect(a.renderer.findByType("svg")).toHaveLength(1)
    a.renderer.simulateKeystrokes("1")
    expect(a.renderer.findByType("svg")).toHaveLength(1)
    const editing = a.renderer.findByTestId("pad")
    if (!editing) throw new Error("Missing editing shell")
    expect(readOuterBounds(a.renderer, a.renderer.getElement(editing.id))?.width).toBe(
      original?.width
    )
    a.unmount()
  })
})

test("keyboard adjusts a focused value and Escape rolls back an active drag", () => {
  const a = mount()
  const element = a.renderer.findByTestId("pad")!
  a.renderer.nativeSimulateKeystrokes(element.id, "up")
  expect(a.value()).toBe(121)
  a.renderer.nativeSimulateMouseDown(a.x, a.y)
  a.renderer.nativeSimulateMouseMove(a.x, a.y - 40, 0)
  expect(a.value()).toBe(131)
  a.renderer.simulateKeystrokes("escape")
  expect(a.value()).toBe(121)
  a.renderer.nativeSimulateMouseUp(a.x, a.y - 40)
  expect(a.value()).toBe(121)
  a.unmount()
})
