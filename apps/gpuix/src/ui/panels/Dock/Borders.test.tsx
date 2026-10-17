import { afterEach, expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ControlEnvironmentProvider, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/ui/controls"
import { englishDockLabels } from "@/app/locales/sections/dock"
import { DockLayout, DockLayoutToggles, DockViewMenu, fromJSON, getGroups, toJSON } from "./index"
import type { DockLayoutJSON, DockPanelRegistry } from "./index"
import { CONTROL_METRICS } from "@/shared/theme/metrics/config"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { PanelEnvironmentProvider } from "../PanelEnvironment"
import { createWindowPointerObserver } from "@/platform/window/pointer-observer"
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
  if (!node || !rect) throw new Error(`Missing ${id}`)
  return { node, ...rect }
}
async function click(root: TestRoot, id: string) {
  const rect = box(root, id)
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2
  root.renderer.nativeSimulateMouseMove(x, y, 0)
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseUp(x, y)
  await settle(root)
}
function Counter() {
  const [count, setCount] = useState(0)
  return (
    <>
    <Button testId="border-counter" onClick={() => setCount(value => value + 1)}>
      {String(count)}
    </Button>
      <DropdownMenu><DropdownMenuTrigger testId="counter-menu">Menu</DropdownMenuTrigger>
        <DropdownMenuContent testId="counter-popup"><DropdownMenuItem testId="counter-menu-item">Command</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
const DEFAULT_BORDERS: DockLayoutJSON["borders"] = {
  right: { tabs: ["tools"], selected: null, size: 260, type: "overlay" },
}
async function mount(borders = DEFAULT_BORDERS, width = 800, observePointer = true) {
  let current: DockLayoutJSON = {
    version: 2,
    root: { kind: "group", id: "main", tabs: ["main"], active: "main" },
    hidden: [],
    activeGroup: "main",
    maximizedGroup: null,
    borders,
  }
  const registry: DockPanelRegistry = {
    main: { title: "Main", minimumSize: 50, render: () => <text>Main content</text> },
    tools: { title: "Tools", icon: "Wrench", minimumSize: 50, render: () => <Counter /> },
    extra: { title: "Extra", icon: "Settings", minimumSize: 50, render: () => <text>Extra content</text> },
  }
  function Harness() {
    const [layout, setLayout] = useState(current)
    const change = (next: DockLayoutJSON) => {
      current = next
      setLayout(next)
    }
    return (
      <div style={{ width, height: 500, display: "flex", flexDirection: "column" }}>
        <div style={{ height: DEFAULT_DESIGN_TOKENS.dock.stripHeight, flexShrink: 0 }}><DockLayoutToggles layout={layout} onLayoutChange={change} labels={englishDockLabels} /></div>
        <DockViewMenu
          layout={layout}
          registry={registry}
          labels={englishDockLabels}
          onLayoutChange={change}
        />
        <div style={{ flexGrow: 1, minHeight: 0 }}>
          <DockLayout
            layout={layout}
            registry={registry}
            labels={englishDockLabels}
            onLayoutChange={change}
          />
        </div>
      </div>
    )
  }
  const pointer = createWindowPointerObserver()
  const root = createTestRoot({ width: Math.max(900, width), height: 600, ...pointer.rootHandlers })
  roots.push(root)
  root.render(
    <PanelEnvironmentProvider environment={observePointer ? { subscribePointer: pointer.subscribePointer } : {}}>
    <ThemeProvider>
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
    </PanelEnvironmentProvider>
  )
  await settle(root)
  return { root, read: () => current }
}
for (const side of ["left", "right", "bottom"] as const) {
  for (const type of ["overlay", "split"] as const) {
    test(`${side} ${type} keeps a fixed rail and one aligned panel edge at 1278px`, async () => {
      const { root } = await mount({ [side]: { tabs: ["tools"], selected: null, size: 260, type } }, 1278)
      const railBefore = box(root, `dock-border-${side}`)
      const mainBefore = box(root, "dock-group-main")
      const edgeProperty = side === "right" ? "borderLeftWidth" : side === "left" ? "borderRightWidth" : "borderTopWidth"
      expect(railBefore.node.style?.[edgeProperty]).toBe(DEFAULT_DESIGN_TOKENS.shape.separatorWidth)
      await click(root, "dock-tab-tools")
      const rail = box(root, `dock-border-${side}`)
      const panel = box(root, `dock-flyout-${side}`)
      const main = box(root, "dock-group-main")
      const strip = box(root, `dock-border-divider-${side}`)
      const line = box(root, `dock-border-divider-${side}-highlight`)
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(rail[key]).toBe(railBefore[key])
        if (type === "overlay") expect(main[key]).toBe(mainBefore[key])
      }
      expect(side === "bottom" ? panel.height : panel.width).toBe(260)
      expect(rail.node.style?.[edgeProperty]).toBe(1)
      expect(panel.node.style?.[edgeProperty] ?? 0).toBe(0)
      const expected = side === "left" ? panel.x + panel.width :
        (side === "right" ? panel.x : panel.y) - (type === "split" ? 1 : 0)
      expect(side === "bottom" ? line.y : line.x).toBe(expected)
      expect(side === "bottom" ? line.height : line.width).toBe(1)
      const axis = side === "bottom" ? "y" : "x"
      const extent = side === "bottom" ? "height" : "width"
      expect(strip[axis] + strip[extent] / 2).toBe(line[axis] + line[extent] / 2)
      root.renderer.nativeSimulateMouseMove(strip.x + strip.width / 2, strip.y + strip.height / 2, 0)
      await settle(root)
      expect(box(root, `dock-border-divider-${side}-highlight`)[axis]).toBe(expected)
    })
  }
}
for (const side of ["left", "right", "bottom"] as const) {
  test(`${side} visibility restores the complete border block and survives JSON`, async () => {
    const { root, read } = await mount({ [side]: { tabs: ["tools"], selected: "tools", size: 180, type: "split" } }, 1278)
    const before = box(root, "dock-group-main")
    const rail = box(root, `dock-border-${side}`)
    await click(root, `dock-layout-${side}`)
    expect(root.renderer.findByTestId(`dock-border-${side}`)).toBeUndefined()
    expect(root.renderer.findByTestId(`dock-flyout-${side}`)).toBeUndefined()
    const main = box(root, "dock-group-main")
    const extent = side === "bottom" ? "height" : "width"
    expect(main[extent]).toBe(before[extent] + rail[extent] + 181)
    expect(fromJSON(toJSON(read())).borders[side]?.visible).toBe(false)
    await click(root, `dock-layout-${side}`)
    expect(box(root, "dock-group-main")[extent]).toBe(before[extent])
    expect(box(root, `dock-flyout-${side}`)[extent]).toBe(180)
  })
}
for (const side of ["left", "right", "bottom"] as const) {
  test(`${side} rail inserts into separate start and end icon groups`, async () => {
    const { root, read } = await mount({ [side]: { tabs: ["tools"], end: ["extra"], selected: null, size: 180, type: "overlay" } }, 1278)
    const horizontal = side === "bottom"
    const rail = box(root, `dock-border-${side}`)
    const unit = DEFAULT_DESIGN_TOKENS.dock.stripHeight
    for (const group of ["end", "start"] as const) {
      const source = box(root, "dock-tab-tools")
      const offset = group === "start" ? unit / 4 : (horizontal ? rail.width : rail.height) - unit * 2
      const x = horizontal ? rail.x + offset : rail.x + rail.width / 2
      const y = horizontal ? rail.y + rail.height / 2 : rail.y + offset
      root.renderer.nativeSimulateMouseMove(source.x + source.width / 2, source.y + source.height / 2, 0)
      root.renderer.nativeSimulateMouseDown(source.x + source.width / 2, source.y + source.height / 2)
      root.renderer.nativeSimulateMouseMove(x, y, 0)
      await settle(root)
      const marker = box(root, `dock-rail-insert-${side}`)
      expect(horizontal ? marker.x : marker.y).toBe((horizontal ? rail.x : rail.y) + (group === "start" ? 0 : (horizontal ? rail.width : rail.height) - unit * 2))
      root.renderer.nativeSimulateMouseUp(x, y)
      await settle(root)
      expect(read().borders[side]?.tabs).toEqual(group === "start" ? ["tools"] : [])
      expect(read().borders[side]?.end).toEqual(group === "start" ? ["extra"] : ["tools", "extra"])
    }
  })
}
test("rail options hover remains stable across repeated native frames without moving its slot", async () => {
  const { root } = await mount()
  const before = box(root, "dock-border-options-slot-right")
  const options = box(root, "dock-border-options-right")
  expect(options.node.style?.opacity).toBe(0)
  root.renderer.nativeSimulateMouseMove(options.x + options.width / 2, options.y + options.height / 2, 0)
  for (let frame = 0; frame < 12; frame++) {
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
    expect(box(root, "dock-border-options-right").node.style?.opacity).toBe(1)
    const slot = box(root, "dock-border-options-slot-right")
    expect([slot.x, slot.y, slot.width, slot.height]).toEqual([before.x, before.y, before.width, before.height])
  }
})
test("rail options enable hover reveal only in drawer mode and close after leaving the block", async () => {
  const { root, read } = await mount()
  await click(root, "dock-border-options-right")
  expect(root.renderer.findByTestId("dock-border-options-mode-right")).toBeDefined()
  await click(root, "dock-border-options-hover-right")
  expect(read().borders.right?.hoverReveal).toBe(true)
  const icon = box(root, "dock-tab-tools")
  root.renderer.nativeSimulateMouseMove(icon.x + icon.width / 2, icon.y + icon.height / 2, 0)
  await settle(root)
  expect(read().borders.right?.selected).toBe("tools")
  const divider = box(root, "dock-border-divider-right-highlight")
  root.renderer.nativeSimulateMouseMove(divider.x, divider.y + divider.height / 2, 0)
  await settle(root)
  expect(read().borders.right?.selected).toBe("tools")
  const content = box(root, "dock-content-tools")
  root.renderer.nativeSimulateMouseMove(content.x + content.width / 2, content.y + content.height / 2, 0)
  await Bun.sleep(DEFAULT_DESIGN_TOKENS.motion.dockHoverCloseDelayMs + 50)
  await settle(root)
  expect(read().borders.right?.selected).toBe("tools")
  await click(root, "counter-menu")
  const popup = box(root, "counter-popup")
  root.renderer.nativeSimulateMouseMove(popup.x + popup.width / 2, popup.y + popup.height / 2, 0)
  await Bun.sleep(DEFAULT_DESIGN_TOKENS.motion.dockHoverCloseDelayMs + 50)
  await settle(root)
  expect(read().borders.right?.selected).toBe("tools")
  await click(root, "counter-menu-item")
  const main = box(root, "dock-group-main")
  root.renderer.nativeSimulateMouseMove(main.x + main.width / 4, main.y + main.height / 2, 0)
  await Bun.sleep(DEFAULT_DESIGN_TOKENS.motion.dockHoverCloseDelayMs + 50)
  await settle(root)
  expect(read().borders.right?.selected).toBeNull()
  await click(root, "dock-border-options-right")
  await click(root, "dock-border-options-mode-right")
  await click(root, "dock-border-options-right")
  expect(read().borders.right?.type).toBe("split")
  const hoverSetting = read().borders.right?.hoverReveal
  await click(root, "dock-border-options-hover-right")
  expect(read().borders.right?.hoverReveal).toBe(hoverSetting)
})
test("border flyout overlays without resizing main and preserves state through close, Escape and outside click", async () => {
  const { root, read } = await mount()
  const before = box(root, "dock-group-main")
  await click(root, "dock-tab-tools")
  expect(read().borders.right?.selected).toBe("tools")
  const counterId = box(root, "border-counter").node.id
  expect(box(root, "dock-group-main").width).toBe(before.width)
  const divider = box(root, "dock-border-divider-right")
  const resizeX = divider.x + divider.width / 2,
    resizeY = divider.y + divider.height / 2
  root.renderer.nativeSimulateMouseMove(resizeX, resizeY, 0)
  root.renderer.nativeSimulateMouseDown(resizeX, resizeY)
  root.renderer.nativeSimulateMouseMove(resizeX - 40, resizeY, 0)
  root.renderer.nativeSimulateMouseUp(resizeX - 40, resizeY)
  await settle(root)
  expect(read().borders.right?.size).toBe(300)
  expect(read().borders.right?.selected).toBe("tools")
  expect(box(root, "dock-group-main").width).toBe(before.width)
  await click(root, "border-counter")
  expect(box(root, "border-counter").node.customProps?.["aria-label"]).toBe("1")
  root.renderer.simulateKeystrokes("escape")
  await settle(root)
  expect(read().borders.right?.selected).toBeNull()
  await click(root, "dock-tab-tools")
  expect(box(root, "border-counter").node.id).toBe(counterId)
  await click(root, "dock-tab-tools")
  expect(read().borders.right?.selected).toBeNull()
  await click(root, "dock-tab-tools")
  await click(root, "dock-tab-main")
  expect(read().borders.right?.selected).toBeNull()
})
test("native border drag moves panel to main and back; View restores a hidden panel", async () => {
  const { root, read } = await mount()
  await click(root, "dock-tab-tools")
  const original = box(root, "border-counter").node.id
  await click(root, "dock-tab-tools")
  const from = box(root, "dock-tab-tools"),
    to = box(root, "dock-group-main")
  root.renderer.nativeSimulateMouseMove(from.x + from.width / 2, from.y + from.height / 2, 0)
  root.renderer.nativeSimulateMouseDown(from.x + from.width / 2, from.y + from.height / 2)
  root.renderer.nativeSimulateMouseMove(to.x + to.width / 2, to.y + to.height / 2, 0)
  root.renderer.nativeSimulateMouseUp(to.x + to.width / 2, to.y + to.height / 2)
  await settle(root)
  expect(getGroups(read().root)[0]?.tabs).toContain("tools")
  expect(box(root, "border-counter").node.id).toBe(original)
  const tab = box(root, "dock-tab-tools")
  root.renderer.nativeSimulateMouseMove(tab.x + tab.width / 2, tab.y + tab.height / 2, 0)
  root.renderer.nativeSimulateMouseDown(tab.x + tab.width / 2, tab.y + tab.height / 2)
  root.renderer.nativeSimulateMouseMove(tab.x + tab.width, tab.y + tab.height, 0)
  await settle(root)
  const bar = box(root, "dock-border-right")
  root.renderer.nativeSimulateMouseMove(bar.x + bar.width / 2, bar.y + bar.height / 2, 0)
  root.renderer.nativeSimulateMouseUp(bar.x + bar.width / 2, bar.y + bar.height / 2)
  await settle(root)
  expect(read().borders.right?.end).toEqual(["tools"])
  await click(root, "dock-view")
  const item = box(root, "dock-view-tools")
  root.renderer.nativeSimulateKeystrokes(item.node.id, "enter")
  await settle(root)
  expect(read().hidden).toContain("tools")
  await click(root, "dock-view")
  root.renderer.nativeSimulateKeystrokes(box(root, "dock-view-tools").node.id, "enter")
  await settle(root)
  expect(getGroups(read().root)[0]?.tabs).toContain("tools")
})

test("rail toggle switches an open drawer to a persistent split and the context menu restores overlay", async () => {
  const { root, read } = await mount()
  const initialWidth = box(root, "dock-group-main").width
  await click(root, "dock-tab-tools")
  await click(root, "dock-border-options-right")
  expect(box(root, "dock-border-options-hover-right").node.customProps?.["aria-disabled"]).not.toBe(true)
  await click(root, "dock-border-options-mode-right")
  expect(read().borders.right?.type).toBe("split")
  expect(box(root, "dock-group-main").width).toBe(initialWidth - 261)
  await click(root, "dock-tab-main")
  root.renderer.simulateKeystrokes("escape")
  await settle(root)
  expect(read().borders.right?.selected).toBe("tools")
  root.renderer.nativeSimulateKeystrokes(box(root, "dock-tab-tools").node.id, "shift-f10")
  await settle(root)
  root.renderer.nativeSimulateKeystrokes(box(root, "dock-border-context-mode-right").node.id, "enter")
  await settle(root)
  expect(read().borders.right?.type).toBe("overlay")
  expect(box(root, "dock-group-main").width).toBe(initialWidth)
})

test("drawer surfaces and rail indicators stay separate; rail buttons are icon-only without tab chrome", async () => {
  const { root } = await mount()
  const unit = CONTROL_METRICS.default["--spacing-control-track"]
  expect(box(root, "dock-tab-tools").height).toBe(unit * 2)
  expect(root.renderer.findByTestId("dock-close-tools")).toBeUndefined()
  expect(box(root, "dock-tab-tools").node.customProps?.["role"]).toBe("button")
  await click(root, "dock-tab-tools")
  expect(box(root, "dock-tab-tools-indicator").width).toBe(
    DEFAULT_DESIGN_TOKENS.dock.activeIndicatorWidth
  )
  const drawer = box(root, "dock-flyout-right")
  const rail = box(root, "dock-border-right")
  const body = box(root, "dock-content-tools")
  expect(drawer.node.style?.backgroundColor).toBe(rail.node.style?.backgroundColor)
  expect(body.node.style?.backgroundColor).not.toBe(
    box(root, "dock-content-main").node.style?.backgroundColor
  )
  expect(box(root, "dock-border-divider-right-highlight").width).toBe(
    DEFAULT_DESIGN_TOKENS.shape.separatorWidth
  )
  expect(drawer.node.style?.borderLeftWidth ?? 0).toBe(0)
  expect(rail.node.style?.borderLeftWidth).toBe(1)
  expect(root.renderer.findByTestId("dock-border-panel-right-pin-border:right")).toBeUndefined()
  expect(root.renderer.findByTestId("dock-border-panel-right-close-tools")).toBeUndefined()
  const panel = box(root, "dock-border-panel-right-group-border:right").node
  const descendants = (id: number): number[] => {
    const children = root.renderer.getElement(id)?.children ?? []
    return children.flatMap(child => [child, ...descendants(child)])
  }
  expect(descendants(panel.id).some(id => root.renderer.getElement(id)?.customProps?.["role"] === "tab")).toBe(false)
  expect(root.renderer.findByTestId("dock-border-panel-right-title-border:right")).toBeDefined()
  expect(box(root, "dock-border-panel-right-actions-border:right").node.style?.opacity).toBe(0)
  const header = box(root, "dock-border-panel-right-header-border:right")
  root.renderer.nativeSimulateMouseMove(header.x + header.width / 2, header.y + header.height / 2, 0)
  await settle(root)
  expect(box(root, "dock-border-panel-right-actions-border:right").node.style?.opacity).toBe(1)
})

test("configured empty edge rails retain geometry and a working mode toggle", async () => {
  const { root, read } = await mount({
    left: { tabs: [], selected: null, size: 180, type: "overlay" },
    right: { tabs: [], selected: null, size: 180, type: "overlay" },
    bottom: { tabs: [], selected: null, size: 180, type: "overlay" },
  })
  const size = DEFAULT_DESIGN_TOKENS.dock.stripHeight
  for (const side of ["left", "right", "bottom"] as const) {
    const rail = box(root, `dock-border-${side}`)
    expect(side === "bottom" ? rail.height : rail.width).toBe(size)
    const toggle = box(root, `dock-border-options-slot-${side}`)
    expect(side === "bottom" ? toggle.x + toggle.width : toggle.y + toggle.height)
      .toBe(side === "bottom" ? rail.x + rail.width : rail.y + rail.height)
    await click(root, `dock-border-options-${side}`)
    await click(root, `dock-border-options-mode-${side}`)
    expect(read().borders[side]?.type).toBe("split")
    expect(root.renderer.findByTestId(`dock-flyout-${side}`)).toBeUndefined()
  }
  const main = box(root, "dock-group-main")
  expect(main.x).toBe(box(root, "dock-border-left").x + size)
  expect(main.x + main.width).toBe(box(root, "dock-border-right").x)
  expect(main.y + main.height).toBe(box(root, "dock-border-bottom").y)
})

test("rail switches between border panels without introducing document tabs", async () => {
  const { root, read } = await mount({ bottom: { tabs: ["tools", "extra"], selected: null, size: 180, type: "split" } })
  await click(root, "dock-tab-tools")
  expect(read().borders.bottom?.selected).toBe("tools")
  const first = box(root, "dock-tab-tools")
  const second = box(root, "dock-tab-extra")
  expect(first.width).toBe(first.height)
  expect(second.x).toBe(first.x + first.width)
  expect(first.node.style?.borderRightWidth ?? 0).toBe(0)
  expect(second.node.style?.borderLeftWidth ?? 0).toBe(0)
  await click(root, "dock-tab-extra")
  expect(read().borders.bottom?.selected).toBe("extra")
  expect(root.renderer.findByTestId("dock-border-panel-bottom-tab-tools")).toBeUndefined()
  expect(root.renderer.findByTestId("dock-border-panel-bottom-tab-extra")).toBeUndefined()
  expect(box(root, "dock-tab-extra-indicator").width).toBe(second.width)
})
