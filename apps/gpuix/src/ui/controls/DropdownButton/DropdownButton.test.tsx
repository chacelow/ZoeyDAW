import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { readOuterBounds } from "../useMeasuredTextWidth"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { DropdownButton } from "."

test("native select skips disabled options and selects once by keyboard", () => {
  const root = createTestRoot({ width: 480, height: 320 })
  const changes: string[] = []
  function Harness() {
    const [value, setValue] = useState("a")
    return (
      <ThemeProvider>
        <div style={{ padding: 80 }}>
          <DropdownButton
            testId="select"
            label="Mode"
            value={value}
            onChange={next => {
              changes.push(next)
              setValue(next)
            }}
            items={[
              { id: "a", label: "Alpha" },
              { id: "b", label: "Disabled", disabled: true },
              { id: "c", label: "Two lines\nEnabled option" },
            ]}
          />
        </div>
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  const trigger = root.renderer.findByTestId("select")!
  root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
  root.renderer.simulateKeystrokes("down")
  root.renderer.simulateKeystrokes("enter")
  expect(changes).toEqual(["c"])
  expect(root.renderer.getFocusedElementId()).toBe(trigger.id)
  root.unmount()
})

test("centered native Select anchors to the compact trigger rather than a stretched parent", async () => {
  const root = createTestRoot({ width: 640, height: 400 })
  root.render(
    <ThemeProvider>
      <div style={{ marginLeft: 250, marginTop: 160 }}>
        <DropdownButton
          testId="center"
          label="Mode"
          value="a"
          onChange={() => {}}
          align="center"
          items={[
            { id: "a", label: "Alpha" },
            { id: "b", label: "Two lines\nEnabled option" },
          ]}
        />
      </div>
    </ThemeProvider>
  )
  root.renderer.flush()
  root.renderer.nativeSimulateKeystrokes(root.renderer.findByTestId("center")!.id, "enter")
  for (let attempt = 0; attempt < 20; attempt++) {
    await Bun.sleep(10)
    flushSync(() => {})
    root.renderer.flush()
    const trigger = readOuterBounds(root.renderer, root.renderer.findByTestId("center"))!
    const content = readOuterBounds(root.renderer, root.renderer.findByTestId("center-content"))!
    if (Math.abs(content.x + content.width / 2 - trigger.x - trigger.width / 2) <= 0.5) break
  }
  const trigger = readOuterBounds(root.renderer, root.renderer.findByTestId("center"))!
  const content = readOuterBounds(root.renderer, root.renderer.findByTestId("center-content"))!
  // Native anchored positions snap to pixels; odd surface widths can differ by half a point.
  expect(
    Math.abs(content.x + content.width / 2 - trigger.x - trigger.width / 2)
  ).toBeLessThanOrEqual(0.5)
  expect(content.y).toBeGreaterThanOrEqual(trigger.y + trigger.height)
  root.unmount()
})
