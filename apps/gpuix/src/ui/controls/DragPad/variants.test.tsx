import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { DragPadBar, DragPadBipolar, DragPadToggle } from "."
import { readOuterBounds } from "../useMeasuredTextWidth"

for (const Component of [DragPadBar, DragPadBipolar]) {
  test(`${Component.name} shares relative sensitivity and clamps keyboard adjustment`, () => {
    const root = createTestRoot({ width: 400, height: 240 })
    let latest = 0
    function Harness() {
      const [value, setValue] = useState(0)
      return (
        <ThemeProvider>
          <div style={{ padding: 80 }}>
            <Component
              testId="variant"
              label="Variant"
              value={value}
              onChange={next => {
                latest = next
                setValue(next)
              }}
              min={-1}
              max={1}
              step={0.01}
            />
          </div>
        </ThemeProvider>
      )
    }
    root.render(<Harness />)
    root.renderer.flush()
    const node = root.renderer.findByTestId("variant")!
    const b = readOuterBounds(root.renderer, root.renderer.getElement(node.id))!
    root.renderer.nativeSimulateMouseDown(b.x + b.width / 2, b.y + b.height / 2)
    root.renderer.nativeSimulateMouseMove(b.x + b.width / 2, b.y + b.height / 2 - 40, 0)
    root.renderer.nativeSimulateMouseUp(b.x + b.width / 2, b.y + b.height / 2 - 40)
    expect(latest).toBeCloseTo(0.1)
    for (let n = 0; n < 100; n++) root.renderer.nativeSimulateKeystrokes(node.id, "up")
    expect(latest).toBe(1)
    const fill = readOuterBounds(
      root.renderer,
      root.renderer.getElement(root.renderer.findByTestId("variant-fill")!.id)
    )!
    expect(fill.width).toBeLessThanOrEqual(b.width)
    expect(fill.width).toBeGreaterThan(0)
    root.unmount()
  })
}

test("toggle activates by click and keyboard without entering numeric edit", () => {
  const root = createTestRoot({ width: 320, height: 120 })
  let latest = false
  function Harness() {
    const [value, setValue] = useState(false)
    return (
      <ThemeProvider>
        <DragPadToggle
          testId="toggle"
          label="Mute"
          value={value}
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
  const node = root.renderer.findByTestId("toggle")!
  const b = readOuterBounds(root.renderer, root.renderer.getElement(node.id))!
  root.renderer.nativeSimulateClick(b.x + b.width / 2, b.y + b.height / 2)
  expect(latest).toBe(true)
  root.renderer.nativeSimulateKeystrokes(node.id, "enter")
  expect(latest).toBe(false)
  expect(root.renderer.findByType("input")).toHaveLength(0)
  root.unmount()
})
