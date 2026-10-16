import { ControlEnvironmentProvider } from "../ControlEnvironment"
import { TEST_INPUT_POLICY } from "../DragPad/input-policy.test-fixture"
import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { PanControl } from "."

test("pan uses center reset and keyboard increments across both channels", () => {
  const root = createTestRoot({ width: 320, height: 160 })
  let latest = 0
  function Harness() {
    const [value, setValue] = useState(0)
    return (
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
          <PanControl
            testId="pan"
            label="声像"
            format={current =>
              current === 0
                ? "中央"
                : `${current < 0 ? "左" : "右"}${Math.round(Math.abs(current) * 100)}`
            }
            parse={raw => Number(raw) / 100}
            widthSamples={["左100", "右100"]}
            value={value}
            onChange={next => {
              latest = next
              setValue(next)
            }}
          />
        </ControlEnvironmentProvider>
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  expect(root.renderer.findByText("中央")).toBeDefined()
  const pad = root.renderer.findByTestId("pan")!
  root.renderer.nativeSimulateKeystrokes(pad.id, "down")
  expect(latest).toBeCloseTo(-0.01)
  root.renderer.flush()
  expect(root.renderer.findByText("左1")).toBeDefined()
  root.renderer.nativeSimulateKeystrokes(pad.id, "up up")
  expect(latest).toBeCloseTo(0.01)
  root.renderer.flush()
  expect(root.renderer.findByText("右1")).toBeDefined()
  const bounds = root.renderer.getElementBounds(pad.id)!
  root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  root.renderer.nativeSimulateKeystrokes(pad.id, "2")
  expect(latest).toBeCloseTo(0.02)
  root.renderer.simulateKeystrokes("enter")
  root.renderer.flush()
  expect(root.renderer.findByText("右2")).toBeDefined()
  root.unmount()
})

test("pan text and reserved width update from caller display configuration", () => {
  const root = createTestRoot({ width: 640, height: 160 })
  const render = (label: string, center: string, widthSamples: readonly string[]) => {
    root.render(
      <ThemeProvider>
        <PanControl
          testId="pan"
          label={label}
          value={0}
          onChange={() => {}}
          format={() => center}
          parse={Number}
          widthSamples={widthSamples}
        />
      </ThemeProvider>
    )
    root.renderer.flush()
    const node = root.renderer.findByTestId("pan")
    if (!node) throw new Error("Pan control missing")
    const bounds = root.renderer.getElementBounds(node.id)
    if (!bounds) throw new Error("Pan control has no bounds")
    return bounds.width
  }
  const originalWidth = render("Pan", "Center", ["Center"])
  const updatedWidth = render("声像", "中央", ["为本地化声像数值保留的宽度"])
  expect(root.renderer.findByText("中央")).toBeDefined()
  expect(root.renderer.findByText("Center")).toBeUndefined()
  expect(updatedWidth).toBeGreaterThan(originalWidth)
  expect(
    Object.values(root.renderer.getA11yTree().nodes ?? {}).some(node => node.aria?.label === "声像")
  ).toBe(true)
  root.unmount()
})
