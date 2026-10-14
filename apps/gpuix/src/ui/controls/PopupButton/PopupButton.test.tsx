import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { DragPadNumber } from "../DragPad"
import { PopupButton } from "."
import { readOuterBounds } from "../useMeasuredTextWidth"

test("embedded numeric drag and repeated wheel adjustment keep popup open until outside press", () => {
  const root = createTestRoot({ width: 480, height: 320 })
  let latest = 120
  function Harness() {
    const [value, setValue] = useState(120)
    return (
      <ThemeProvider>
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
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  const trigger = readOuterBounds(
    root.renderer,
    root.renderer.getElement(root.renderer.findByTestId("popup")!.id)
  )!
  root.renderer.nativeSimulateClick(trigger.x + 2, trigger.y + 2)
  const bounds = readOuterBounds(
    root.renderer,
    root.renderer.getElement(root.renderer.findByTestId("inner")!.id)
  )!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x + 150, y - 40, 0)
  root.renderer.nativeSimulateMouseUp(x + 150, y - 40)
  expect(latest).toBe(130)
  expect(root.renderer.findByTestId("popup-content")).toBeDefined()
  root.renderer.nativeSimulateScrollWheel(x, y, 0, 16)
  const afterFirst = latest
  root.renderer.nativeSimulateScrollWheel(x, y, 0, 16)
  expect(latest).toBeLessThan(afterFirst)
  expect(root.renderer.findByTestId("popup-content")).toBeDefined()
  root.renderer.nativeSimulateClick(440, 280)
  expect(root.renderer.findByTestId("popup-content")).toBeUndefined()
  root.unmount()
})
