import { afterEach, expect, test } from "bun:test"
import { flushSync, handleGpuixEvent } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { TitleBar } from "./TitleBar"

let root: TestRoot | undefined
afterEach(() => {
  root?.unmount()
  root = undefined
})
function mount() {
  const observed = { systemActions: 0, settingsOpens: 0 }
  const view = createTestRoot({ width: 640, height: 80 })
  root = view
  view.render(
    <ThemeProvider>
      <TitleBar
        title="Native project"
        settingsLabel="Settings"
        surface="transparent"
        onTitlebarDoubleClick={() => {
          observed.systemActions += 1
        }}
        onOpenSettings={() => {
          observed.settingsOpens += 1
        }}
      />
    </ThemeProvider>
  )
  function click(testId: string, clickCount: number, button = 0) {
    const node = view.renderer.findByTestId(testId)
    if (!node) throw new Error(`Missing ${testId}`)
    const bounds = view.renderer.getElementBounds(node.id)
    if (!bounds) throw new Error(`${testId} is not laid out`)
    const dispatch = view.renderer.dispatchNativeEvents
    view.renderer.dispatchNativeEvents = () => {
      for (const event of view.renderer.drainEvents()) {
        flushSync(() => handleGpuixEvent({ ...event, clickCount }, view.renderer))
      }
    }
    try {
      const x = bounds.x + bounds.width / (testId === "titlebar" ? 4 : 2)
      view.renderer.nativeSimulateClick(x, bounds.y + bounds.height / 2, button)
    } finally {
      view.renderer.dispatchNativeEvents = dispatch
    }
  }
  return { view, observed, click }
}

test("only a left double click on titlebar whitespace executes the system action", () => {
  const { observed, click } = mount()
  click("titlebar", 1)
  expect(observed.systemActions).toBe(0)
  click("titlebar", 2)
  expect(observed.systemActions).toBe(1)
  click("titlebar", 3)
  click("titlebar", 2, 2)
  expect(observed.systemActions).toBe(1)
})

test("settings double clicks do not reach the titlebar system action", () => {
  const { view, observed, click } = mount()
  click("titlebar-settings", 2)
  expect(observed.systemActions).toBe(0)
  expect(observed.settingsOpens).toBe(1)
  const button = view.renderer.findByTestId("titlebar-settings")
  if (!button) throw new Error("Missing Settings button")
  const bounds = view.renderer.getElementBounds(button.id)
  if (!bounds) throw new Error("Settings button is not laid out")
  view.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  expect(observed.settingsOpens).toBe(2)
  expect(observed.systemActions).toBe(0)
})

test("double clicking centered title text executes the system action once", () => {
  const { observed, click } = mount()
  click("titlebar-title", 2)
  expect(observed.systemActions).toBe(1)
})
