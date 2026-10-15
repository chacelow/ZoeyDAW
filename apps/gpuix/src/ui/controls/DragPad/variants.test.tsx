import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { DragPadBar, DragPadBipolar, DragPadToggle } from "."

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
    const b = root.renderer.getElementBounds(node.id)!
    root.renderer.nativeSimulateMouseDown(b.x + b.width / 2, b.y + b.height / 2)
    root.renderer.nativeSimulateMouseMove(b.x + b.width / 2, b.y + b.height / 2 - 40, 0)
    root.renderer.nativeSimulateMouseUp(b.x + b.width / 2, b.y + b.height / 2 - 40)
    expect(latest).toBeCloseTo(0.1)
    for (let n = 0; n < 100; n++) root.renderer.nativeSimulateKeystrokes(node.id, "up")
    expect(latest).toBe(1)
    const fill = root.renderer.getElementBounds(root.renderer.findByTestId("variant-fill")!.id)!
    expect(fill.width).toBeLessThanOrEqual(b.width)
    expect(fill.width).toBeGreaterThan(0)
    root.unmount()
  })
}

for (const Component of [DragPadBar, DragPadBipolar]) {
  for (const parentWidth of [50, 33]) {
    for (const value of Component === DragPadBipolar ? [1, 0] : [1]) {
      test(`${Component.name} value ${value} uses actual ${parentWidth}px shell width before and during editing`, () => {
        const root = createTestRoot({ width: 300, height: 160 })
        const render = (width: number) => {
          root.render(
            <ThemeProvider>
              <div style={{ width }}>
                <Component
                  testId="stretched"
                  label="Stretched value"
                  value={value}
                  onChange={() => {}}
                  min={-1}
                  max={1}
                  step={0.01}
                  hideIcon
                  style={{ width: "100%" }}
                />
              </div>
            </ThemeProvider>
          )
        }
        const settleLayout = () => {
          for (let pass = 0; pass < 3; pass++) {
            root.renderer.flush()
            root.renderer.dispatchNativeEvents()
          }
          root.renderer.flush()
        }
        const assertGeometry = (width: number) => {
          settleLayout()
          const shell = root.renderer.findByTestId("stretched")!
          const bounds = root.renderer.getElementBounds(shell!.id)!
          const fillNode = root.renderer.findByTestId("stretched-fill")!
          const fill = root.renderer.getElementBounds(fillNode!.id)!
          expect(bounds.width).toBe(width)
          if (value === 1) {
            expect(
              Math.abs(fill.x + fill.width - (bounds.x + bounds.width - 1))
            ).toBeLessThanOrEqual(0.5)
            if (Component === DragPadBar) {
              expect(Math.abs(fill.x - (bounds.x + 1))).toBeLessThanOrEqual(0.5)
            }
          } else {
            expect(fill.width).toBe(0)
          }
          if (Component === DragPadBipolar) {
            const center = root.renderer.findByTestId("stretched-center")!
            const line = root.renderer.getElementBounds(center!.id)!
            expect(
              Math.abs(line.x + line.width / 2 - (bounds.x + bounds.width / 2))
            ).toBeLessThanOrEqual(0.5)
          }
          return bounds
        }
        render(parentWidth)
        const bounds = assertGeometry(parentWidth)
        root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        assertGeometry(parentWidth)
        root.renderer.simulateKeystrokes("enter")
        expect(root.renderer.findByType("input")).toHaveLength(1)
        assertGeometry(parentWidth)
        const resizedWidth = parentWidth === 50 ? 33 : 50
        render(resizedWidth)
        assertGeometry(resizedWidth)
        root.unmount()
      })
    }
  }
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
  const b = root.renderer.getElementBounds(node.id)!
  root.renderer.nativeSimulateClick(b.x + b.width / 2, b.y + b.height / 2)
  expect(latest).toBe(true)
  root.renderer.nativeSimulateKeystrokes(node.id, "enter")
  expect(latest).toBe(false)
  expect(root.renderer.findByType("input")).toHaveLength(0)
  root.unmount()
})
