import { afterEach, expect, test } from "bun:test"
import { createRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { CONTROL_METRICS } from "@/shared/theme/metrics/config"
import { ControlEnvironmentProvider, Button } from "@/ui/controls"
import { DockLayout, getGroups, hideTab, resizeSplit } from "./index"
import type { DockLayoutJSON, DockLayoutHandle, DockPanelRegistry } from "./index"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})
async function settle(root: TestRoot) {
  for (let i = 0; i < 4; i++) {
    await Bun.sleep(35)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}
function box(root: TestRoot, id: string) {
  const node = root.renderer.findByTestId(id)
  const rect = node && root.renderer.getElementBounds(node.id)
  if (!rect) throw new Error(`Missing painted element: ${id}`)
  return rect
}
function Counter() {
  const [count, setCount] = useState(0)
  return (
    <Button testId="counter" onClick={() => setCount(value => value + 1)}>
      {String(count)}
    </Button>
  )
}
const labels = {
  close: "Close",
  closeOthers: "Close others",
  splitRight: "Split right",
  splitDown: "Split down",
  maximize: "Maximize",
  restore: "Restore",
  hide: "Hide",
  dragGroup: "Drag group",
  more: "More group actions",
  showPanels: "Show panels",
}
const initial: DockLayoutJSON = {
  version: 1,
  hidden: [],
  activeGroup: "a",
  maximizedGroup: null,
  root: {
    kind: "split",
    id: "root",
    orientation: "horizontal",
    sizes: [1, 1],
    children: [
      { kind: "group", id: "a", tabs: ["one", "two"], active: "one" },
      { kind: "group", id: "b", tabs: ["three"], active: "three" },
    ],
  },
}
async function mount(control = CONTROL_METRICS.default, width = 900) {
  let current = initial
  let changes = 0
  const ref = createRef<DockLayoutHandle>()
  const replace = createRef<Dispatch<SetStateAction<DockLayoutJSON>>>()
  const registry: DockPanelRegistry = {
    one: { title: "One", minimumSize: 50, closable: true, render: () => <Counter /> },
    two: { title: "Two", minimumSize: 50, closable: true, render: () => <text>Two</text> },
    three: { title: "Three", minimumSize: 50, closable: true, render: () => <text>Three</text> },
    four: { title: "Four", minimumSize: 50, closable: false, render: () => <text>Four</text> },
  }
  function Harness() {
    const [layout, setLayout] = useState(initial)
    replace.current = setLayout
    return (
      <div style={{ width, height: 450 }}>
        <DockLayout
          ref={ref}
          layout={layout}
          registry={registry}
          labels={labels}
          onLayoutChange={next => {
            current = next
            changes++
            setLayout(next)
          }}
        />
      </div>
    )
  }
  const root = createTestRoot({ width: 1000, height: 600 })
  roots.push(root)
  root.render(
    <ThemeProvider control={control}>
      <ControlEnvironmentProvider
        value={{
          inputPolicy: {
            dragThresholdPixels: 3,
            dragPixelsPerStep: 4,
            wheelPixelsPerStep: 16,
            wheelLinePixels: 16,
          },
        }}
      >
        <Harness />
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
  root.renderer.flush()
  await settle(root)
  return {
    root,
    ref,
    read: () => current,
    changes: () => changes,
    replace: (next: DockLayoutJSON) => {
      if (!replace.current) throw new Error("Harness not mounted")
      replace.current(next)
    },
  }
}
async function drag(
  root: TestRoot,
  tab: string,
  target: string,
  position: "left" | "right" | "top" | "bottom" | "center"
) {
  const from = box(root, `dock-tab-${tab}`)
  const to = box(root, `dock-group-${target}`)
  const x =
    position === "left"
      ? to.x + 5
      : position === "right"
        ? to.x + to.width - 5
        : to.x + to.width / 2
  const y =
    position === "top"
      ? to.y + from.height + 5
      : position === "bottom"
        ? to.y + to.height - 5
        : to.y + to.height / 2
  root.renderer.nativeSimulateMouseDown(from.x + from.width / 2, from.y + from.height / 2)
  root.renderer.nativeSimulateMouseMove(x, y, 0)
  root.renderer.nativeSimulateMouseUp(x, y)
  await settle(root)
}
test("native tab edge drag splits and a center drop merges without remounting panel state", async () => {
  const { root, read } = await mount()
  const counter = box(root, "counter")
  root.renderer.nativeSimulateMouseDown(counter.x + 4, counter.y + 4)
  root.renderer.nativeSimulateMouseUp(counter.x + 4, counter.y + 4)
  await drag(root, "one", "b", "left")
  expect(getGroups(read().root).length).toBe(3)
  const source = getGroups(read().root).find(group => group.tabs.includes("one"))
  expect(source?.id).not.toBe("a")
  const counterNode = root.renderer.findByTestId("counter")
  expect(counterNode?.customProps?.["aria-label"]).toBe("1")
  await drag(root, "one", "b", "center")
  expect(getGroups(read().root).length).toBe(2)
  expect(getGroups(read().root).find(group => group.id === "b")?.tabs).toEqual(["three", "one"])
  expect(root.renderer.findByTestId("counter")?.customProps?.["aria-label"]).toBe("1")
})
test("Escape discards a native drag preview and later release cannot commit it", async () => {
  const { root, read } = await mount()
  const from = box(root, "dock-tab-two")
  const to = box(root, "dock-group-b")
  root.renderer.nativeSimulateMouseDown(from.x + 5, from.y + 5)
  root.renderer.nativeSimulateMouseMove(to.x + 5, to.y + to.height / 2, 0)
  root.renderer.simulateKeystrokes("escape")
  root.renderer.nativeSimulateMouseUp(to.x + 5, to.y + to.height / 2)
  await settle(root)
  expect(read().root).toEqual(initial.root)
})
test("closing the last tab via the shared close button collapses the split", async () => {
  const { root, read } = await mount()
  const close = box(root, "dock-close-three")
  root.renderer.nativeSimulateMouseDown(close.x + close.width / 2, close.y + close.height / 2)
  root.renderer.nativeSimulateMouseUp(close.x + close.width / 2, close.y + close.height / 2)
  await settle(root)
  expect(read().root?.kind).toBe("group")
  expect(read().root?.id).toBe("a")
})
test("imperative docking commands move, maximize, hide and restore active group selection", async () => {
  const { root, ref, read } = await mount()
  expect(ref.current?.executeCommand("moveRight")).toBe(true)
  await settle(root)
  expect(getGroups(read().root).find(group => group.id === "b")?.active).toBe("one")
  expect(ref.current?.executeCommand("toggleMaximize")).toBe(true)
  await settle(root)
  expect(read().maximizedGroup).toBe("b")
  expect(ref.current?.executeCommand("hide")).toBe(true)
  await settle(root)
  expect(read().hidden).toEqual(["one"])
})

test("replacing controlled JSON applies split weights without changing panel state", async () => {
  const { root, read, replace } = await mount()
  const before = box(root, "dock-group-a").width
  replace(resizeSplit(read(), "root", [1, 3]))
  await settle(root)
  const left = box(root, "dock-group-a").width
  const right = box(root, "dock-group-b").width
  expect(left).toBeLessThan(before)
  expect(right / left).toBeCloseTo(3, 1)
})

test("native group grip moves all panels while preserving its group id", async () => {
  const { root, read } = await mount()
  const grip = box(root, "dock-drag-group-a")
  const target = box(root, "dock-group-b")
  const x = target.x + target.width / 2
  const y = target.y + target.height - 5
  root.renderer.nativeSimulateMouseDown(grip.x + grip.width / 2, grip.y + grip.height / 2)
  root.renderer.nativeSimulateMouseMove(x, y, 0)
  root.renderer.nativeSimulateMouseUp(x, y)
  await settle(root)
  expect(read().root).toMatchObject({
    kind: "split",
    orientation: "vertical",
    children: [{ id: "b" }, { id: "a", tabs: ["one", "two"] }],
  })
})

test("focus loss cancels a captured tab drag before its release", async () => {
  const { root, read } = await mount()
  const from = box(root, "dock-tab-two")
  const to = box(root, "dock-group-b")
  root.renderer.nativeSimulateMouseDown(from.x + 5, from.y + 5)
  root.renderer.nativeSimulateMouseMove(to.x + 5, to.y + to.height / 2, 0)
  const outside = root.renderer.findByTestId("dock-tab-three")
  if (!outside) throw new Error("Missing focus target")
  root.renderer.focusElement(outside.id)
  root.renderer.dispatchNativeEvents()
  root.renderer.nativeSimulateMouseUp(to.x + 5, to.y + to.height / 2)
  await settle(root)
  expect(read().root).toEqual(initial.root)
})

test("dragging to right, top, and bottom edges creates the corresponding split", async () => {
  for (const position of ["right", "top", "bottom"] as const) {
    const { root, read } = await mount()
    await drag(root, "two", "b", position)
    const groups = getGroups(read().root)
    expect(groups).toHaveLength(3)
    expect(groups.find(group => group.tabs.includes("two"))?.id).not.toBe("a")
    const layoutRoot = read().root
    const targetSplit =
      layoutRoot?.kind === "split"
        ? layoutRoot.children.find(child => child.kind === "split")
        : undefined
    expect(targetSplit?.kind).toBe("split")
    if (targetSplit?.kind === "split") {
      expect(targetSplit.orientation).toBe(position === "right" ? "horizontal" : "vertical")
      const moved = targetSplit.children.findIndex(
        child => child.kind === "group" && child.tabs.includes("two")
      )
      expect(moved).toBe(position === "right" || position === "bottom" ? 1 : 0)
    }
  }
})

test("shared sash keeps its hit width and clamps Dock panels at registered minimum sizes", async () => {
  const { root, read } = await mount()
  const sash = box(root, "dock-divider-root-1")
  const before = box(root, "dock-group-a")
  expect(sash.width).toBe(7)
  const x = sash.x + sash.width / 2
  const y = sash.y + sash.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x - before.width, y, 0)
  root.renderer.nativeSimulateMouseUp(x - before.width, y)
  await settle(root)
  expect(box(root, "dock-group-a").width).toBeGreaterThanOrEqual(50)
  expect(box(root, "dock-group-b").width).toBeGreaterThanOrEqual(50)
  expect(read().root?.kind).toBe("split")
  expect(box(root, "dock-divider-root-1").width).toBe(7)
})

test("group action controls stay outside the tab overflow viewport", async () => {
  const { root } = await mount()
  const group = box(root, "dock-group-a")
  const more = box(root, "dock-more-a")
  const maximize = box(root, "dock-maximize-a")
  expect(more.x + more.width).toBeLessThanOrEqual(group.x + group.width)
  expect(maximize.x + maximize.width).toBeLessThanOrEqual(more.x)
})

test("drop preview distinguishes edge, center, and tab insertion opacity", async () => {
  const { root } = await mount()
  const from = box(root, "dock-tab-two")
  const target = box(root, "dock-group-b")
  const tab = box(root, "dock-tab-three")
  root.renderer.nativeSimulateMouseDown(from.x + 4, from.y + 4)
  root.renderer.nativeSimulateMouseMove(target.x + 5, target.y + target.height / 2, 0)
  root.renderer.flush()
  expect(root.renderer.findByTestId("dock-drop-preview")?.style?.opacity).toBe(0.3)
  root.renderer.nativeSimulateMouseMove(
    target.x + target.width / 2,
    target.y + target.height / 2,
    0
  )
  root.renderer.flush()
  expect(root.renderer.findByTestId("dock-drop-preview")?.style?.opacity).toBe(0.18)
  root.renderer.nativeSimulateMouseMove(tab.x + tab.width / 2, tab.y + tab.height / 2, 0)
  root.renderer.flush()
  expect(root.renderer.findByTestId("dock-drop-preview")?.style?.opacity).toBe(0.8)
  root.renderer.simulateKeystrokes("escape")
})

test("group more menu performs the active tab action", async () => {
  const { root, read } = await mount()
  const trigger = root.renderer.findByTestId("dock-more-a")
  if (!trigger) throw new Error("Missing group actions trigger")
  root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
  root.renderer.simulateKeystrokes("enter")
  await settle(root)
  expect(getGroups(read().root).find(group => group.id === "a")?.tabs).toEqual(["two"])
})

test("group menu restores a hidden panel into that group", async () => {
  const { root, read, replace } = await mount()
  replace(hideTab(read(), "three"))
  await settle(root)
  const trigger = root.renderer.findByTestId("dock-more-a")
  if (!trigger) throw new Error("Missing group actions trigger")
  root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
  const submenu = root.renderer.findByTestId("dock-show-panels-a")
  if (!submenu) throw new Error("Missing show panels submenu")
  root.renderer.nativeSimulateKeystrokes(submenu.id, "right")
  const item = root.renderer.findByTestId("dock-show-three")
  if (!item) throw new Error("Missing hidden panel menu item")
  root.renderer.nativeSimulateKeystrokes(item.id, "enter")
  await settle(root)
  expect(getGroups(read().root).find(group => group.id === "a")?.tabs).toContain("three")
  expect(read().hidden).not.toContain("three")
})

test("group menu can add a registered nonclosable panel absent from the layout", async () => {
  const { root, read } = await mount()
  const trigger = root.renderer.findByTestId("dock-more-b")
  if (!trigger) throw new Error("Missing group actions trigger")
  root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
  const submenu = root.renderer.findByTestId("dock-show-panels-b")
  if (!submenu) throw new Error("Missing show panels submenu")
  root.renderer.nativeSimulateKeystrokes(submenu.id, "right")
  const item = root.renderer.findByTestId("dock-show-four")
  if (!item) throw new Error("Missing registered panel menu item")
  root.renderer.nativeSimulateKeystrokes(item.id, "enter")
  await settle(root)
  expect(getGroups(read().root).find(group => group.id === "b")?.tabs).toEqual(["three", "four"])
})

test("Dock strip and tabs follow a ThemeProvider control override", async () => {
  const control = {
    ...CONTROL_METRICS.default,
    "--spacing-control-track": 20,
    "--spacing-control-track-pad": 2,
    "--spacing-control-track-gap": 6,
  }
  const { root } = await mount(control)
  const tab = root.renderer.findByTestId("dock-tab-one")
  expect(tab?.style?.height).toBe(40)
  expect(tab?.style?.paddingLeft).toBe(6)
  expect(tab?.style?.maxWidth).toBe(240)
  const group = box(root, "dock-group-a")
  const content = box(root, "dock-content-one")
  expect(content.y - group.y).toBeGreaterThanOrEqual(40)
})

test("active tab stays distinct and inactive close appears on hover", async () => {
  const { root } = await mount()
  const active = root.renderer.findByTestId("dock-tab-one")
  const inactive = root.renderer.findByTestId("dock-tab-two")
  expect(active?.customProps?.["aria-selected"]).toBe(true)
  expect(inactive?.customProps?.["aria-selected"]).toBe(false)
  expect(root.renderer.findByTestId("dock-close-one")?.style?.opacity).toBe(1)
  expect(root.renderer.findByTestId("dock-close-two")?.style?.opacity).toBe(0)
  const target = box(root, "dock-tab-two")
  root.renderer.nativeSimulateMouseMove(target.x + 5, target.y + 5, 0)
  root.renderer.flush()
  expect(root.renderer.findByTestId("dock-close-two")?.style?.opacity).toBe(1)
})

test("group actions show only for the active or hovered group, without a highlight border", async () => {
  const { root } = await mount()
  const actions = (id: string) => root.renderer.findByTestId(`dock-actions-${id}`)?.style?.opacity
  const border = (id: string) => root.renderer.findByTestId(`dock-group-${id}`)?.style?.borderColor
  expect(actions("a")).toBe(1)
  expect(actions("b")).toBe(0)
  expect(border("a")).toBe(border("b"))
  const header = box(root, "dock-header-b")
  root.renderer.nativeSimulateMouseMove(
    header.x + header.width / 2,
    header.y + header.height / 2,
    0
  )
  root.renderer.flush()
  expect(actions("b")).toBe(1)
  expect(border("a")).toBe(border("b"))
})

test("clicking a panel content activates its Dock group without moving focus to the tab", async () => {
  const { root, read } = await mount()
  const content = box(root, "dock-content-three")
  const x = content.x + content.width / 2
  const y = content.y + content.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseUp(x, y)
  await settle(root)
  expect(read().activeGroup).toBe("b")
  expect(root.renderer.getFocusedElementId()).not.toBe(
    root.renderer.findByTestId("dock-tab-three")?.id
  )
})
test("narrow headers retain only more actions while maximize stays reachable from the menu", async () => {
  const { root, read } = await mount(CONTROL_METRICS.default, 360)
  expect(root.renderer.findByTestId("dock-drag-group-a")).toBeUndefined()
  expect(root.renderer.findByTestId("dock-maximize-a")).toBeUndefined()
  const more = root.renderer.findByTestId("dock-more-a")
  if (!more) throw new Error("Missing compact group actions")
  root.renderer.nativeSimulateKeystrokes(more.id, "enter")
  await settle(root)
  const maximize = root.renderer.findByTestId("dock-maximize-menu-a")
  if (!maximize) throw new Error("Missing compact maximize menu action")
  root.renderer.nativeSimulateKeystrokes(maximize.id, "enter")
  await settle(root)
  expect(read().maximizedGroup).toBe("a")
  expect(root.renderer.findByTestId("dock-maximize-a")).toBeDefined()
  expect(root.renderer.findByTestId("dock-drag-group-a")).toBeDefined()
})
