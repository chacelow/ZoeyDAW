import { afterEach, expect, test } from "bun:test"
import { flushSync, handleGpuixEvent } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { Button } from "@/ui/controls/Button"
import { TitleBar } from "."
import type { TitleBarWindow } from "."

const roots: TestRoot[] = []
afterEach(() => { for (const root of roots.splice(0)) root.unmount() })

function mount(platform: TitleBarWindow["platform"], width = 640) {
  const calls: string[] = []
  const root = createTestRoot({ width, height: 100 })
  roots.push(root)
  root.render(<ThemeProvider><TitleBar
    title="An intentionally very long project title that must never overlap the actions or window controls"
    window={{ platform, minimize: () => { calls.push("minimize") }, zoom: () => { calls.push("zoom") }, close: () => { calls.push("close") }, doubleClick: () => { calls.push("double") } }}
    labels={{ minimize: "Minimize", maximizeRestore: "Maximize / restore", close: "Close" }}
    left={<Button testId="file">File</Button>}
    actions={<Button testId="settings" onClick={() => { calls.push("settings") }}>Settings</Button>}
  /></ThemeProvider>)
  for (let frame = 0; frame < 4; frame++) { root.renderer.flush(); root.renderer.dispatchNativeEvents() }
  return { root, calls }
}

function bounds(root: TestRoot, testId: string) {
  const node = root.renderer.findByTestId(testId)
  if (!node) throw new Error(`Missing ${testId}`)
  const box = root.renderer.getElementBounds(node.id)
  if (!box) throw new Error(`Missing bounds for ${testId}`)
  return box
}

function click(root: TestRoot, testId: string, clickCount = 1) {
  const box = bounds(root, testId)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const dispatch = root.renderer.dispatchNativeEvents
  root.renderer.dispatchNativeEvents = () => {
    for (const event of root.renderer.drainEvents()) flushSync(() => handleGpuixEvent({ ...event, clickCount }, root.renderer))
  }
  try {
    root.renderer.nativeSimulateMouseMove(x, y)
    root.renderer.nativeSimulateClick(x, y)
  } finally { root.renderer.dispatchNativeEvents = dispatch }
}

test("custom window controls call their injected commands without claiming the drag area", () => {
  const { root, calls } = mount("windows")
  for (const id of ["titlebar-minimize", "titlebar-maximize", "titlebar-close", "settings"]) click(root, id)
  expect(calls).toEqual(["minimize", "zoom", "close", "settings"])
  expect(root.renderer.findByTestId("titlebar-drag")?.style?.windowControlArea).toBe("drag")
  for (const id of ["file", "settings", "titlebar-maximize"]) expect(root.renderer.findByTestId(id)?.style?.windowControlArea).toBeUndefined()
})

test("macOS keeps traffic lights clear and only title whitespace invokes the native preference action", () => {
  const { root, calls } = mount("macos")
  expect(root.renderer.findByTestId("titlebar-window-controls")).toBeUndefined()
  expect(bounds(root, "file").x).toBe(PROJECT_METRICS.trafficLightInset)
  click(root, "titlebar-drag", 2)
  click(root, "settings", 2)
  expect(calls).toEqual(["double", "settings"])
})

test("narrow titlebars truncate the title while retaining both slots and full window-control hit areas", () => {
  const { root } = mount("windows", 360)
  const left = bounds(root, "file")
  const title = bounds(root, "titlebar-title")
  const actions = bounds(root, "settings")
  const controls = bounds(root, "titlebar-window-controls")
  expect(left.x + left.width).toBeLessThanOrEqual(title.x)
  expect(title.x + title.width).toBeLessThanOrEqual(actions.x)
  expect(actions.x + actions.width).toBeLessThanOrEqual(controls.x)
  expect(controls.x + controls.width).toBeLessThanOrEqual(360)
  expect(bounds(root, "titlebar-close").width).toBe(PROJECT_METRICS.windowControlWidth)
  expect(root.renderer.findByTestId("titlebar-title")?.style?.textOverflow).toBe("ellipsis")
})
