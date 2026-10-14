import { readOuterBounds } from "../useMeasuredTextWidth"
import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { MotionTabs } from "."

const options = [
  { key: "a", label: "First", content: <div testId="pane-a" /> },
  { key: "b", label: "Disabled", disabled: true, content: <div testId="pane-b" /> },
  { key: "c", label: "Last", content: <div testId="pane-c" /> },
]

test("tabs select accessible panes through arrows and Home/End with matching indicator geometry", () => {
  const root = createTestRoot({ width: 500, height: 240 })
  const changes: string[] = []
  root.render(
    <ThemeProvider>
      <MotionTabs
        options={options}
        tabWidth={100}
        reducedMotion
        onChange={key => {
          changes.push(key)
        }}
      />
    </ThemeProvider>
  )
  root.renderer.flush()
  const first = root.renderer.findByTestId("motion-tab-a")
  const last = root.renderer.findByTestId("motion-tab-c")
  if (!first || !last) throw new Error("Missing tabs")
  expect(root.renderer.findByTestId("pane-a")).toBeDefined()
  root.renderer.nativeSimulateKeystrokes(first.id, "right")
  expect(changes).toEqual(["c"])
  expect(root.renderer.getFocusedElementId()).toBe(last.id)
  expect(root.renderer.findByTestId("pane-c")).toBeDefined()
  expect(root.renderer.findByTestId("pane-a")).toBeUndefined()
  const indicator = root.renderer.findByTestId("motion-tabs-indicator")
  if (!indicator) throw new Error("Missing indicator")
  const activeBounds = readOuterBounds(root.renderer, root.renderer.getElement(last.id))
  const indicatorBounds = readOuterBounds(root.renderer, root.renderer.getElement(indicator.id))
  expect(indicatorBounds?.x).toBe(activeBounds?.x)
  expect(indicatorBounds?.width).toBe(100)
  root.renderer.simulateKeystrokes("home")
  expect(root.renderer.findByTestId("pane-a")).toBeDefined()
  root.renderer.simulateKeystrokes("end")
  expect(root.renderer.findByTestId("pane-c")).toBeDefined()
  root.unmount()
})

test("defaultTab updates reset selection and controlled value remains authoritative", () => {
  const root = createTestRoot({ width: 500, height: 240 })
  const changes: string[] = []
  root.render(
    <ThemeProvider>
      <MotionTabs options={options} defaultTab="a" reducedMotion />
    </ThemeProvider>
  )
  root.renderer.flush()
  root.render(
    <ThemeProvider>
      <MotionTabs options={options} defaultTab="c" reducedMotion />
    </ThemeProvider>
  )
  root.renderer.flush()
  expect(root.renderer.findByTestId("pane-c")).toBeDefined()
  root.render(
    <ThemeProvider>
      <MotionTabs
        options={options}
        value="a"
        reducedMotion
        onChange={key => {
          changes.push(key)
        }}
      />
    </ThemeProvider>
  )
  root.renderer.flush()
  const last = root.renderer.findByTestId("motion-tab-c")
  if (!last) throw new Error("Missing tab")
  root.renderer.nativeSimulateKeystrokes(last.id, "enter")
  expect(changes).toEqual(["c"])
  expect(root.renderer.findByTestId("pane-a")).toBeDefined()
  root.unmount()
})
