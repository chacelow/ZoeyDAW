import { afterEach, describe, expect, test } from "bun:test"
import { createRef, Profiler, useRef, useState } from "react"
import type { ReactNode } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { ThemeProvider } from "../../shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { Button } from "@/ui/controls/Button"
import { Group } from "./Group"
import { Panel } from "./Panel"
import type { PanelImperativeHandle } from "./Panel"
import { PanelDivider } from "./PanelDivider"
import { PanelShell } from "./PanelShell"
import { PanelEnvironmentProvider } from "./PanelEnvironment"
import { CollapseDivider } from "./CollapseDivider"
import { DividerLayer } from "./DividerLayer"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

async function mount(node: ReactNode) {
  const root = createTestRoot({ width: 1200, height: 760 })
  roots.push(root)
  root.render(<ThemeProvider><DividerLayer style={{ width: "100%", height: "100%" }}>{node}</DividerLayer></ThemeProvider>)
  root.renderer.flush()
  await settle(root)
  return root
}

async function settle(root: TestRoot) {
  for (let i = 0; i < 4; i++) {
    await Bun.sleep(40)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}

function bounds(root: TestRoot, id: string) {
  const node = root.renderer.findByTestId(id)
  const box = node && root.renderer.getElementBounds(node.id)
  if (!box) throw new Error(`Missing painted panel: ${id}`)
  return box
}

function divider(root: TestRoot, id: string) {
  const box = bounds(root, id)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function pair(ref = createRef<PanelImperativeHandle>()) {
  return (
    <Group orientation="horizontal" style={{ width: 800, height: 400 }}>
      <Panel defaultSize="25" minSize={190} maxSize="50" collapsible panelRef={ref} testId="left">
        <text>Browser</text>
      </Panel>
      <PanelDivider orientation="vertical" testId="divider" />
      <Panel testId="right">
        <text>Arrangement</text>
      </Panel>
    </Group>
  )
}

const DEVICE_HEIGHT = 160

function EditorSplitRegression() {
  const clip = useRef<PanelImperativeHandle>(null)
  const [clipHeight, setClipHeight] = useState(0)
  const [devices, setDevices] = useState(true)
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Button
        style={{ height: 24, flexShrink: 0 }}
        onClick={() => {
          if (clip.current?.isCollapsed()) clip.current.resize(160)
          else clip.current?.collapse()
        }}
      >
        Toggle Clip
      </Button>
      <Group orientation="vertical" style={{ height: 0, flexGrow: 1 }}>
        <Panel minSize={180}>
          <text>Arrangement</text>
        </Panel>
        <PanelDivider
          orientation="horizontal"
          testId="clip-divider"
          disabled={clipHeight === 0}
          hidden={clipHeight === 0}
        />
        <Panel
          defaultSize={0}
          minSize={120}
          maxSize="70%"
          collapsible
          panelRef={clip}
          onResize={size => setClipHeight(size.inPixels)}
          testId="clip-panel"
        >
          <text>Clip</text>
        </Panel>
      </Group>
      <CollapseDivider
        expanded={devices}
        expandedSize={DEVICE_HEIGHT}
        onExpandedChange={setDevices}
        aria-label="Toggle Device"
        formatAccessiblePixels={pixels => `${pixels} pixels`}
        testId="device-divider"
      />
      <div testId="device-panel" style={{ height: devices ? DEVICE_HEIGHT : 0, flexShrink: 0 }} />
    </div>
  )
}

describe("native resizable panel interactions", () => {
  test("a hairline divider captures beyond its overlay and keeps a continuous pixel delta", async () => {
    const root = await mount(pair())
    const before = bounds(root, "left").width
    const point = divider(root, "divider")
    expect(bounds(root, "divider").width).toBe(PROJECT_METRICS.panelGap)
    expect(bounds(root, "divider-line").width).toBe(DEFAULT_DESIGN_TOKENS.shape.separatorWidth)
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x + 60, point.y + 120, 0)
    expect(bounds(root, "left").width).toBeCloseTo(before + 60)
    expect(bounds(root, "divider-highlight").x).toBeCloseTo(before + 60)
    root.renderer.nativeSimulateMouseUp(point.x + 60, point.y + 120)
    expect(bounds(root, "left").width - before).toBeCloseTo(60)
    expect(bounds(root, "left").width + bounds(root, "right").width + DEFAULT_DESIGN_TOKENS.shape.separatorWidth).toBeCloseTo(800)
  })

  test("Escape restores a drag snapshot and release cannot reapply the cancelled preview", async () => {
    const root = await mount(pair())
    const before = bounds(root, "left").width
    const point = divider(root, "divider")
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x + 80, point.y, 0)
    expect(bounds(root, "left").width).toBeCloseTo(before + 80)
    expect(bounds(root, "divider-highlight").x).toBeCloseTo(before + 80)
    root.renderer.simulateKeystrokes("escape")
    root.renderer.nativeSimulateMouseUp(point.x + 80, point.y)
    expect(bounds(root, "left").width).toBeCloseTo(before)
  })

  test("divider highlights only its hairline on hover and drag", async () => {
    const root = await mount(pair())
    const point = divider(root, "divider")
    const handle = root.renderer.findByTestId("divider")
    expect(handle?.style?.cursor).toBe("col-resize")
    expect(bounds(root, "divider").width).toBe(PROJECT_METRICS.panelGap)
    expect(bounds(root, "divider-highlight").width).toBe(DEFAULT_DESIGN_TOKENS.shape.separatorWidth)
    root.renderer.nativeSimulateMouseMove(point.x, point.y)
    root.renderer.flush()
    const hovered = root.renderer.findByTestId("divider-highlight")?.style?.backgroundColor
    expect(hovered).not.toBe(root.renderer.findByTestId("divider-line")?.style?.backgroundColor)
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.flush()
    expect(root.renderer.findByTestId("divider-highlight")?.style?.backgroundColor).toBe(hovered)
    root.renderer.nativeSimulateMouseUp(point.x, point.y)
  })

  test("both sides of the hairline resize while panel content outside the sash receives clicks", async () => {
    let clicks = 0
    const root = await mount(
      <Group orientation="horizontal" style={{ width: 800, height: 400 }}>
        <Panel testId="left"><Button label="Left content" onClick={() => clicks++} style={{ width: "100%", height: "100%" }} /></Panel>
        <PanelDivider orientation="vertical" testId="divider" />
        <Panel testId="right"><Button label="Right content" onClick={() => clicks++} style={{ width: "100%", height: "100%" }} /></Panel>
      </Group>
    )
    const left = bounds(root, "left")
    const right = bounds(root, "right")
    expect(right.x - left.x - left.width).toBeCloseTo(DEFAULT_DESIGN_TOKENS.shape.separatorWidth)
    for (const side of [-1, 1]) {
      const before = bounds(root, "left").width
      const point = divider(root, "divider")
      const x = point.x + side * 3
      root.renderer.nativeSimulateMouseMove(x, point.y)
      root.renderer.nativeSimulateMouseDown(x, point.y)
      root.renderer.nativeSimulateMouseMove(x + 20, point.y, 0)
      root.renderer.nativeSimulateMouseUp(x + 20, point.y)
      expect(bounds(root, "left").width).toBeCloseTo(before + 20)
    }
    expect(clicks).toBe(0)
    const point = divider(root, "divider")
    for (const side of [-1, 1]) {
      const x = point.x + side * (PROJECT_METRICS.panelGap + 1)
      root.renderer.nativeSimulateMouseMove(x, point.y)
      root.renderer.nativeSimulateClick(x, point.y)
    }
    expect(clicks).toBe(2)
  })

  test("focus loss cancels and directional keys adjust the focused divider", async () => {
    const root = await mount(
      <div>
        {pair()}
        <div role="button" tabIndex={0} testId="outside" style={{ width: 100, height: 50 }}>
          <text>Outside</text>
        </div>
      </div>
    )
    const before = bounds(root, "left").width
    const point = divider(root, "divider")
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x + 80, point.y, 0)
    const outside = root.renderer.findByTestId("outside")
    if (!outside) throw new Error("Missing outside focus target")
    root.renderer.focusElement(outside.id)
    root.renderer.dispatchNativeEvents()
    root.renderer.nativeSimulateMouseUp(point.x + 80, point.y)
    expect(bounds(root, "left").width).toBeCloseTo(before)
    const handle = root.renderer.findByTestId("divider")
    if (!handle) throw new Error("Missing divider")
    root.renderer.nativeSimulateKeystrokes(handle.id, "right")
    expect(bounds(root, "left").width).toBeCloseTo(before + 10)
    root.renderer.simulateKeystrokes("left")
    expect(bounds(root, "left").width).toBeCloseTo(before)
  })

  test("imperative collapse and expand restore pixels and onResize reports both units", async () => {
    const ref = createRef<PanelImperativeHandle>()
    let reported = { inPixels: -1, asPercentage: -1 }
    const root = await mount(
      <Group orientation="horizontal" style={{ width: 800, height: 400 }}>
        <Panel
          defaultSize="25"
          minSize={190}
          maxSize="50"
          collapsible
          panelRef={ref}
          onResize={size => {
            reported = size
          }}
          testId="left"
        />
        <PanelDivider orientation="vertical" />
        <Panel testId="right" />
      </Group>
    )
    const before = ref.current?.getSize().inPixels ?? 0
    expect(before).toBeCloseTo((800 - DEFAULT_DESIGN_TOKENS.shape.separatorWidth) / 4)
    expect(reported.asPercentage).toBeCloseTo(25)
    ref.current?.resize(300)
    await settle(root)
    expect(bounds(root, "left").width).toBeCloseTo(300)
    ref.current?.collapse()
    await settle(root)
    expect(ref.current?.isCollapsed()).toBe(true)
    expect(reported.inPixels).toBe(0)
    ref.current?.expand()
    await settle(root)
    expect(ref.current?.isCollapsed()).toBe(false)
    expect(bounds(root, "left").width).toBeCloseTo(300)
  })

  test("layout events reflow smaller and larger containers without stale pixels", async () => {
    let resize: ((width: number) => void) | undefined
    function Harness() {
      const [width, setWidth] = useState(800)
      resize = setWidth
      return (
        <Group orientation="horizontal" style={{ width, height: 400 }} testId="container">
          <Panel defaultSize="25" minSize={100} maxSize="50" testId="left" />
          <PanelDivider orientation="vertical" />
          <Panel minSize={100} testId="right" />
        </Group>
      )
    }
    const root = await mount(<Harness />)
    for (const width of [400, 1100, 300, 800]) {
      resize?.(width)
      await settle(root)
      const left = bounds(root, "left").width
      const right = bounds(root, "right").width
      expect(left + right + DEFAULT_DESIGN_TOKENS.shape.separatorWidth).toBeCloseTo(width)
      expect(left).toBeGreaterThanOrEqual(100)
      expect(left).toBeLessThanOrEqual((width - DEFAULT_DESIGN_TOKENS.shape.separatorWidth) / 2)
      expect(right).toBeGreaterThanOrEqual(100)
    }
  })

  test("borderless active shells retain identical bounds and activation reaches child presses", async () => {
    let active = "arrangement"
    let childPresses = 0
    function Harness() {
      const [section, setSection] = useState("arrangement")
      return (
        <div style={{ width: 300, height: 200 }}>
          <PanelShell
            id="browser"
            aria-label="资源浏览器"
            activeDescription="当前活动面板"
            active={section}
            onActivate={id => {
              active = id
              setSection(id)
            }}
            testId="shell"
          >
            <div
              role="button"
              tabIndex={0}
              testId="child"
              style={{ width: 100, height: 50 }}
              onMouseDown={() => {
                childPresses++
              }}
            >
              <text>Child</text>
            </div>
          </PanelShell>
        </div>
      )
    }
    const root = await mount(<Harness />)
    const before = bounds(root, "shell")
    const inactiveShell = Object.values(root.renderer.getA11yTree().nodes ?? {}).find(
      node => node.aria?.label === "资源浏览器"
    )
    expect(inactiveShell).toBeDefined()
    expect(inactiveShell?.aria?.description).toBeUndefined()
    expect(
      Object.values(root.renderer.getA11yTree().nodes ?? {}).some(
        node => node.aria?.label === "browser"
      )
    ).toBe(false)
    const child = divider(root, "child")
    root.renderer.nativeSimulateClick(child.x, child.y)
    expect(active).toBe("browser")
    expect(childPresses).toBe(1)
    expect(bounds(root, "shell")).toEqual(before)
    expect(
      Object.values(root.renderer.getA11yTree().nodes ?? {}).find(
        node => node.aria?.label === "资源浏览器"
      )?.aria?.description
    ).toBe("当前活动面板")
  })

  test("fixed divider formats collapsed zero and expanded fractional pixels after keyboard changes", async () => {
    function Harness() {
      const [expanded, setExpanded] = useState(false)
      return (
        <CollapseDivider
          testId="fixed-divider"
          expanded={expanded}
          expandedSize={160.5}
          onExpandedChange={setExpanded}
          aria-label="Ajuster le panneau"
          formatAccessiblePixels={pixels => `${pixels.toFixed(1).replace(".", ",")} points`}
        />
      )
    }
    const root = await mount(<Harness />)
    const handle = root.renderer.findByTestId("fixed-divider")
    if (!handle) throw new Error("Missing fixed divider")
    const valueText = () =>
      Object.values(root.renderer.getA11yTree().nodes ?? {}).find(
        node => node.aria?.label === "Ajuster le panneau"
      )?.aria?.value
    expect(valueText()).toBe("0,0 points")
    root.renderer.nativeSimulateKeystrokes(handle.id, "up")
    expect(valueText()).toBe("160,5 points")
    root.renderer.nativeSimulateKeystrokes(handle.id, "down")
    expect(valueText()).toBe("0,0 points")
  })

  test("Clip expansion leaves Device fixed and Device threshold reverses before release", async () => {
    const root = await mount(<EditorSplitRegression />)
    const deviceBefore = bounds(root, "device-panel").height
    const toggle = root.renderer.findByText("Toggle Clip")
    if (!toggle) throw new Error("Missing clip toggle")
    const toggleBox = root.renderer.getElementBounds(toggle.id)
    if (!toggleBox) throw new Error("Missing clip toggle bounds")
    root.renderer.nativeSimulateClick(toggleBox.x + 10, toggleBox.y + 5)
    await settle(root)
    expect(bounds(root, "clip-panel").height).toBeCloseTo(160)
    expect(bounds(root, "device-panel").height).toBe(DEVICE_HEIGHT)
    expect(deviceBefore).toBe(DEVICE_HEIGHT)
    const point = divider(root, "device-divider")
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x, point.y + 79, 0)
    expect(bounds(root, "device-panel").height).toBe(DEVICE_HEIGHT)
    root.renderer.nativeSimulateMouseMove(point.x, point.y + 81, 0)
    expect(bounds(root, "device-panel").height).toBe(0)
    root.renderer.nativeSimulateMouseMove(point.x, point.y + 30, 0)
    expect(bounds(root, "device-panel").height).toBe(DEVICE_HEIGHT)
    root.renderer.nativeSimulateMouseUp(point.x, point.y + 30)
  })

  test("a divider hidden by collapse finishes capture without reopening its panel", async () => {
    const root = await mount(<EditorSplitRegression />)
    const toggle = root.renderer.findByText("Toggle Clip")
    const box = toggle && root.renderer.getElementBounds(toggle.id)
    if (!box) throw new Error("Missing clip toggle")
    root.renderer.nativeSimulateClick(box.x + 5, box.y + 5)
    await settle(root)
    const point = divider(root, "clip-divider")
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x, point.y + 110, 0)
    root.renderer.nativeSimulateMouseUp(point.x, point.y + 110)
    await settle(root)
    expect(bounds(root, "clip-panel").height).toBe(0)
    root.renderer.nativeSimulateClick(box.x + 5, box.y + 5)
    await settle(root)
    expect(bounds(root, "clip-panel").height).toBe(160)
    expect(bounds(root, "device-panel").height).toBe(DEVICE_HEIGHT)
  })

  test("injected window inactivity rolls back once and ignores later captured moves", async () => {
    let notify: ((active: boolean) => void) | undefined
    let unsubscribed = 0
    const environment = {
      subscribeWindowActive: (listener: (active: boolean) => void) => {
        notify = listener
        return () => {
          unsubscribed++
        }
      },
    }
    const root = await mount(
      <PanelEnvironmentProvider environment={environment}>{pair()}</PanelEnvironmentProvider>
    )
    const before = bounds(root, "left").width
    const point = divider(root, "divider")
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x + 60, point.y, 0)
    expect(bounds(root, "left").width).toBeCloseTo(before + 60)
    expect(bounds(root, "divider-highlight").x).toBeCloseTo(before + 60)
    notify?.(false)
    await settle(root)
    expect(bounds(root, "left").width).toBeCloseTo(before)
    notify?.(false)
    notify?.(true)
    root.renderer.nativeSimulateMouseMove(point.x + 100, point.y, 0)
    root.renderer.nativeSimulateMouseUp(point.x + 100, point.y)
    expect(bounds(root, "left").width).toBeCloseTo(before)
    root.unmount()
    roots.splice(roots.indexOf(root), 1)
    expect(unsubscribed).toBe(1)
  })

  test("layout events cannot change the pointer anchor during an active drag", async () => {
    let resize: ((width: number) => void) | undefined
    function Harness() {
      const [width, setWidth] = useState(800)
      resize = setWidth
      return (
        <Group orientation="horizontal" style={{ width, height: 400 }}>
          <Panel defaultSize="25" minSize={100} maxSize="50" testId="left" />
          <PanelDivider orientation="vertical" testId="divider" />
          <Panel minSize={100} testId="right" />
        </Group>
      )
    }
    const root = await mount(<Harness />)
    const before = bounds(root, "left").width
    const point = divider(root, "divider")
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x + 60, point.y, 0)
    resize?.(600)
    await settle(root)
    expect(bounds(root, "left").width).toBeCloseTo(before + 60)
    root.renderer.nativeSimulateMouseMove(point.x + 80, point.y, 0)
    expect(bounds(root, "left").width).toBeCloseTo(before + 80)
    expect(bounds(root, "divider-highlight").x).toBeCloseTo(before + 80)
    root.renderer.nativeSimulateMouseUp(point.x + 80, point.y)
    await settle(root)
    expect(bounds(root, "left").width + bounds(root, "right").width + DEFAULT_DESIGN_TOKENS.shape.separatorWidth).toBeCloseTo(600)
  })
})

test("resize moves coalesce to one latest snapshot per injected frame and release flushes the final size", async () => {
  let frame: (() => void) | undefined
  let scheduled = 0
  let commits = 0
  const root = await mount(
    <PanelEnvironmentProvider environment={{ scheduleFrame: callback => {
      scheduled++
      frame = callback
      return () => { if (frame === callback) frame = undefined }
    } }}>
      <Profiler id="frame-resize" onRender={() => commits++}>{pair()}</Profiler>
    </PanelEnvironmentProvider>
  )
  const before = bounds(root, "left").width
  const point = divider(root, "divider")
  root.renderer.nativeSimulateMouseDown(point.x, point.y)
  root.renderer.nativeSimulateMouseMove(point.x + 20, point.y, 0)
  root.renderer.nativeSimulateMouseMove(point.x + 40, point.y, 0)
  expect(scheduled).toBe(1)
  expect(bounds(root, "left").width).toBe(before)
  const pending = frame
  if (!pending) throw new Error("Missing scheduled resize frame")
  commits = 0
  flushSync(pending)
  root.renderer.flush()
  expect(commits).toBe(1)
  expect(bounds(root, "left").width).toBeCloseTo(before + 40)
  root.renderer.nativeSimulateMouseMove(point.x + 60, point.y, 0)
  root.renderer.nativeSimulateMouseUp(point.x + 60, point.y)
  expect(frame).toBeUndefined()
  expect(bounds(root, "left").width).toBeCloseTo(before + 60)
})
