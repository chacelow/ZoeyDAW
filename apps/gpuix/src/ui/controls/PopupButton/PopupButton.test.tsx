import { ControlEnvironmentProvider } from "../ControlEnvironment"
import { TEST_INPUT_POLICY } from "../DragPad/input-policy.test-fixture"
import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { DragPadNumber } from "../DragPad"
import { PopupButton } from "."

test("embedded numeric drag and repeated wheel adjustment keep popup open until outside press", () => {
  const root = createTestRoot({ width: 480, height: 320 })
  let latest = 120
  function Harness() {
    const [value, setValue] = useState(120)
    return (
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
          <div style={{ padding: 80 }}>
            <PopupButton testId="popup" trigger="Adjust" label="Adjust values">
              <DragPadNumber
                testId="inner"
                label="Value"
                value={value}
                onChange={next => {
                  latest = next
                  setValue(next)
                }}
                min={20}
                max={300}
                step={1}
              />
            </PopupButton>
          </div>
        </ControlEnvironmentProvider>
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  const trigger = root.renderer.getElementBounds(root.renderer.findByTestId("popup")!.id)!
  root.renderer.nativeSimulateClick(trigger.x + 2, trigger.y + 2)
  const bounds = root.renderer.getElementBounds(root.renderer.findByTestId("inner")!.id)!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x + 150, y - 40, 0)
  root.renderer.nativeSimulateMouseUp(x + 150, y - 40)
  expect(latest).toBe(130)
  expect(root.renderer.findByTestId("popup-content")).toBeDefined()
  root.renderer.nativeSimulateScrollWheel(x, y, 0, 16)
  const afterFirst = latest
  expect(afterFirst).toBe(131)
  root.renderer.nativeSimulateScrollWheel(x, y, 0, 16)
  expect(latest).toBeGreaterThan(afterFirst)
  expect(latest).toBe(132)
  expect(root.renderer.findByTestId("popup-content")).toBeDefined()
  root.renderer.nativeSimulateClick(440, 280)
  expect(root.renderer.findByTestId("popup-content")).toBeUndefined()
  root.unmount()
})

test("toolbar Space leaves popup state unchanged and reaches the window", () => {
  const keys: string[] = []
  const prevented: boolean[] = []
  const root = createTestRoot({
    width: 480,
    height: 320,
    onKeyDown: event => {
      keys.push(event.key ?? "")
      prevented.push(event.defaultPrevented)
    },
  })
  try {
    root.render(
      <ThemeProvider>
        <PopupButton testId="popup" label="Values" trigger="Values">
          <text>Popup values</text>
        </PopupButton>
      </ThemeProvider>
    )
    const trigger = root.renderer.findByTestId("popup")!
    root.renderer.nativeSimulateKeystrokes(trigger.id, "space")
    expect(root.renderer.findByTestId("popup-content")).toBeUndefined()
    expect(keys).toEqual(["space"])
    expect(prevented).toEqual([false])
    root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
    expect(root.renderer.findByTestId("popup-content")).toBeDefined()
    keys.length = 0
    prevented.length = 0
    root.renderer.nativeSimulateKeystrokes(trigger.id, "space")
    expect(root.renderer.findByTestId("popup-content")).toBeDefined()
    expect(keys).toEqual(["space"])
    expect(prevented).toEqual([false])
  } finally {
    root.unmount()
  }
})
