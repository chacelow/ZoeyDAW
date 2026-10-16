import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRef, useState } from "react"
import type { ReactNode } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../shared/theme/ThemeProvider"
import { Group } from "./Group"
import { Panel } from "./Panel"
import type { PanelImperativeHandle } from "./Panel"
import { PanelDivider } from "./PanelDivider"
import { PanelShell } from "./PanelShell"
import { PanelGallery, GALLERY_DEVICE_HEIGHT } from "./PanelGallery"
import { PanelEnvironmentProvider } from "./PanelEnvironment"
import { CollapseDivider } from "./CollapseDivider"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

async function mount(node: ReactNode) {
  const root = createTestRoot({ width: 1200, height: 760 })
  roots.push(root)
  root.render(<ThemeProvider>{node}</ThemeProvider>)
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

describe("native resizable panel interactions", () => {
  test("a 7px divider captures beyond its hitbox and keeps a continuous pixel delta", async () => {
    const root = await mount(pair())
    const before = bounds(root, "left").width
    const point = divider(root, "divider")
    expect(bounds(root, "divider").width).toBe(7)
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x + 60, point.y + 120, 0)
    root.renderer.nativeSimulateMouseUp(point.x + 60, point.y + 120)
    expect(bounds(root, "left").width - before).toBeCloseTo(60)
    expect(bounds(root, "left").width + bounds(root, "right").width + 7).toBeCloseTo(800)
  })

  test("Escape restores a drag snapshot and release cannot reapply the cancelled preview", async () => {
    const root = await mount(pair())
    const before = bounds(root, "left").width
    const point = divider(root, "divider")
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x + 80, point.y, 0)
    expect(bounds(root, "left").width).toBeCloseTo(before + 80)
    root.renderer.simulateKeystrokes("escape")
    root.renderer.nativeSimulateMouseUp(point.x + 80, point.y)
    expect(bounds(root, "left").width).toBeCloseTo(before)
  })

  test("divider paints distinct idle, hover and pressed states and stays pressed while dragging", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "divider-states-"))
    const image = path.join(directory, "frame.png")
    try {
      const root = await mount(pair())
      const point = divider(root, "divider")
      const capture = () => {
        root.renderer.flush()
        root.renderer.captureScreenshot(image)
        return readFileSync(image)
      }
      root.renderer.clockPause()
      root.renderer.nativeSimulateMouseMove(point.x + 300, point.y)
      const idle = capture()
      root.renderer.nativeSimulateMouseMove(point.x, point.y)
      const hover = capture()
      root.renderer.nativeSimulateMouseDown(point.x, point.y)
      const pressed = capture()
      expect(hover.equals(idle)).toBe(false)
      expect(pressed.equals(hover)).toBe(false)
      expect(pressed.equals(idle)).toBe(false)
      root.renderer.nativeSimulateMouseUp(point.x, point.y)
      expect(capture().equals(hover)).toBe(true)
      root.renderer.nativeSimulateMouseMove(point.x + 300, point.y)
      expect(capture().equals(idle)).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
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
    expect(before).toBeCloseTo(793 / 4)
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
      expect(left + right + 7).toBeCloseTo(width)
      expect(left).toBeGreaterThanOrEqual(100)
      expect(left).toBeLessThanOrEqual((width - 7) / 2)
      expect(right).toBeGreaterThanOrEqual(100)
    }
  })

  test("active shell borders retain identical bounds and activation reaches child presses", async () => {
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

  test("gallery Clip expansion leaves Device fixed and Device threshold reverses before release", async () => {
    const root = await mount(<PanelGallery />)
    const deviceBefore = bounds(root, "device-panel").height
    const toggle = root.renderer.findByText("Toggle Clip")
    if (!toggle) throw new Error("Missing clip toggle")
    const toggleBox = root.renderer.getElementBounds(toggle.id)
    if (!toggleBox) throw new Error("Missing clip toggle bounds")
    root.renderer.nativeSimulateClick(toggleBox.x + 10, toggleBox.y + 5)
    await settle(root)
    expect(bounds(root, "clip-panel").height).toBeCloseTo(160)
    expect(bounds(root, "device-panel").height).toBe(GALLERY_DEVICE_HEIGHT)
    expect(deviceBefore).toBe(GALLERY_DEVICE_HEIGHT)
    const point = divider(root, "device-divider")
    root.renderer.nativeSimulateMouseDown(point.x, point.y)
    root.renderer.nativeSimulateMouseMove(point.x, point.y + 79, 0)
    expect(bounds(root, "device-panel").height).toBe(GALLERY_DEVICE_HEIGHT)
    root.renderer.nativeSimulateMouseMove(point.x, point.y + 81, 0)
    expect(bounds(root, "device-panel").height).toBe(0)
    root.renderer.nativeSimulateMouseMove(point.x, point.y + 30, 0)
    expect(bounds(root, "device-panel").height).toBe(GALLERY_DEVICE_HEIGHT)
    root.renderer.nativeSimulateMouseUp(point.x, point.y + 30)
  })

  test("a divider hidden by collapse finishes capture without reopening its panel", async () => {
    const root = await mount(<PanelGallery />)
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
    expect(bounds(root, "device-panel").height).toBe(GALLERY_DEVICE_HEIGHT)
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
    root.renderer.nativeSimulateMouseUp(point.x + 80, point.y)
    await settle(root)
    expect(bounds(root, "left").width + bounds(root, "right").width + 7).toBeCloseTo(600)
  })
})
