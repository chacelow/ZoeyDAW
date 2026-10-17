import { ControlEnvironmentProvider } from "../ControlEnvironment"
import { TEST_INPUT_POLICY } from "./input-policy.test-fixture"
import { describe, expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "../../../shared/theme/ThemeProvider"
import { DragPadNumber } from "./DragPadNumber"

function mount(initial = 120, min = 0, max = 300, step = 1) {
  let latest = initial
  const root = createTestRoot({ width: 640, height: 320 })
  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
          <DragPadNumber
            label="Value"
            testId="pad"
            value={value}
            min={min}
            max={max}
            step={step}
            defaultValue={120}
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
  const element = root.renderer.findByTestId("pad")
  if (!element) throw new Error("DragPadNumber not mounted")
  const bounds = root.renderer.getElementBounds(element.id)
  if (!bounds) throw new Error("DragPadNumber not painted")
  return {
    ...root,
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    value: () => latest,
  }
}

describe("DragPadNumber native interactions", () => {
  test("relative drag keeps tracking outside the control and ignores horizontal distance", () => {
    const a = mount()
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    a.renderer.nativeSimulateMouseMove(a.x + 180, a.y - 40, 0)
    a.renderer.nativeSimulateMouseUp(a.x + 180, a.y - 40)
    expect(a.value()).toBe(130)
    a.unmount()
  })

  test("subdividing a drag into more move events cannot change its result", () => {
    const a = mount()
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    for (let distance = 4; distance <= 40; distance += 4) {
      a.renderer.nativeSimulateMouseMove(a.x, a.y - distance, 0)
    }
    a.renderer.nativeSimulateMouseUp(a.x, a.y - 40)
    expect(a.value()).toBe(130)
    a.unmount()
  })

  test("small ranges use the same steps per vertical pixel", () => {
    const a = mount(0, -1, 1, 0.01)
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 40, 0)
    a.renderer.nativeSimulateMouseUp(a.x, a.y - 40)
    expect(a.value()).toBeCloseTo(0.1)
    a.unmount()
  })

  test("wheel adjusts only the hovered pad, without a preceding press", () => {
    const a = mount()
    a.renderer.nativeSimulateScrollWheel(a.x + 300, a.y + 100, 0, 16)
    expect(a.value()).toBe(120)
    a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, 16)
    expect(a.value()).not.toBe(120)
    expect(a.value()).toBe(121)
    a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, -32)
    expect(a.value()).toBe(119)
    a.unmount()
  })

  test("wheel over a pad changes its consumer without scrolling its ancestor", () => {
    const root = createTestRoot({ width: 320, height: 180 })
    let latest = 120
    function Harness() {
      const [value, setValue] = useState(120)
      return (
        <ThemeProvider>
          <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
            <div testId="scroll-parent" style={{ width: 200, height: 100, overflow: "scroll" }}>
              <div style={{ height: 400, flexShrink: 0, alignItems: "start" }}>
                <DragPadNumber
                  label="Wheel owner"
                  testId="wheel-pad"
                  value={value}
                  min={0}
                  max={300}
                  step={1}
                  onChange={next => {
                    latest = next
                    setValue(next)
                  }}
                />
              </div>
            </div>
          </ControlEnvironmentProvider>
        </ThemeProvider>
      )
    }
    root.render(<Harness />)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
    root.renderer.flush()
    const scroll = root.renderer.findByTestId("scroll-parent")!
    const pad = root.renderer.findByTestId("wheel-pad")!
    const bounds = root.renderer.getElementBounds(pad!.id)!
    const before = root.renderer.getScrollOffset(scroll.id)
    expect(before).not.toBeNull()
    root.renderer.nativeSimulateScrollWheel(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      0,
      -16
    )
    root.renderer.flush()
    expect(latest).toBe(119)
    expect(root.renderer.getAllText()).toContain("119")
    expect(root.renderer.getScrollOffset(scroll.id)).toEqual(before)
    const viewport = root.renderer.getElementBounds(scroll!.id)!
    root.renderer.nativeSimulateScrollWheel(
      viewport.x + viewport.width - 10,
      viewport.y + viewport.height / 2,
      0,
      -40
    )
    root.renderer.flush()
    expect(latest).toBe(119)
    expect(root.renderer.getScrollOffset(scroll.id)![1]).toBeLessThan(before![1])
    root.unmount()
  })

  test("click preserves value; typing updates it live; Enter finishes editing", () => {
    const a = mount()
    a.renderer.nativeSimulateClick(a.x, a.y)
    expect(a.value()).toBe(120)
    expect(a.renderer.findByType("input")).toHaveLength(0)
    a.renderer.simulateKeystrokes("9")
    expect(a.renderer.findByType("input")).toHaveLength(1)
    expect(a.value()).toBe(9)
    a.renderer.simulateKeystrokes("9")
    expect(a.value()).toBe(99)
    a.renderer.simulateKeystrokes("enter")
    expect(a.renderer.findByType("input")).toHaveLength(0)
    expect(a.value()).toBe(99)
    a.unmount()
  })

  test("Escape cancels the live editing transaction", () => {
    const a = mount()
    a.renderer.nativeSimulateClick(a.x, a.y)
    a.renderer.simulateKeystrokes("9")
    a.renderer.simulateKeystrokes("9")
    expect(a.value()).toBe(99)
    a.renderer.simulateKeystrokes("escape")
    expect(a.value()).toBe(120)
    expect(a.renderer.findByType("input")).toHaveLength(0)
    a.unmount()
  })
})

test("keyboard adjusts a focused value and Escape rolls back an active drag", () => {
  const a = mount()
  const element = a.renderer.findByTestId("pad")!
  a.renderer.nativeSimulateKeystrokes(element.id, "up")
  expect(a.value()).toBe(121)
  a.renderer.nativeSimulateMouseDown(a.x, a.y)
  a.renderer.nativeSimulateMouseMove(a.x, a.y - 40, 0)
  expect(a.value()).toBe(131)
  a.renderer.simulateKeystrokes("escape")
  expect(a.value()).toBe(121)
  a.renderer.nativeSimulateMouseUp(a.x, a.y - 40)
  expect(a.value()).toBe(121)
  a.unmount()
})

test("icon-less numbers reserve no slot and editing keeps the same shell bounds", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  let padding = 0
  let unit = 0
  let minimumWidth = 0
  let foreground = ""
  function Fixture() {
    const theme = useTheme()
    const [value, setValue] = useState(120)
    padding = theme.control["--spacing-control-track-pad"]
    unit = theme.control["--spacing-control-track"]
    minimumWidth = theme.design.grid.numericWidthUnits * unit
    foreground = theme.colors.foreground
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "start" }}>
        <DragPadNumber
          testId="hidden"
          label="Hidden icon number"
          value={value}
          onChange={setValue}
          min={20}
          max={300}
          step={1}
          defaultValue={120}
        />
        <text
          testId="widest"
          style={{ fontSize: theme.control["--text-control-track"], fontFamily: "Menlo" }}
        >
          300
        </text>
      </div>
    )
  }
  root.render(
    <ThemeProvider>
      <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
        <Fixture />
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
  for (let pass = 0; pass < 4; pass++) {
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
  const shell = root.renderer.findByTestId("hidden")!
  const original = root.renderer.getElementBounds(shell!.id)!
  const text = root.renderer.getElementBounds(root.renderer.findByTestId("widest")!.id)!
  expect(original.width).toBe(
    Math.max(minimumWidth, Math.ceil((text.width + padding * 2 + 2) / unit) * unit)
  )
  expect(root.renderer.findByTestId("hidden-edit-indicator")).toBeUndefined()
  const assertIndicatorFits = () => {
    const element = root.renderer.findByTestId("hidden-edit-indicator")!
    const indicator = root.renderer.getElementBounds(element!.id)!
    const value = root.renderer.getElementBounds(root.renderer.findByTestId("hidden-value")!.id)!
    expect(indicator.x).toBeGreaterThanOrEqual(original.x)
    expect(indicator.y).toBeGreaterThanOrEqual(original.y)
    expect(indicator.y + indicator.height).toBeLessThanOrEqual(original.y + original.height)
    expect(indicator.x + indicator.width).toBeLessThanOrEqual(value.x)
    expect(element.style.backgroundColor).toBe(foreground)
    expect(element.style.backgroundColor).not.toBe(
      root.renderer.findByTestId("hidden")!.style.backgroundColor
    )
  }
  root.renderer.nativeSimulateClick(
    original.x + original.width / 2,
    original.y + original.height / 2
  )
  expect(root.renderer.findByTestId("hidden-edit-indicator")).toBeDefined()
  expect(root.renderer.getElementBounds(root.renderer.findByTestId("hidden")!.id)).toEqual(original)
  assertIndicatorFits()
  root.renderer.simulateKeystrokes("9")
  expect(root.renderer.findByType("input")).toHaveLength(1)
  expect(root.renderer.findByTestId("hidden-edit-indicator")).toBeDefined()
  expect(root.renderer.getElementBounds(root.renderer.findByTestId("hidden")!.id)).toEqual(original)
  assertIndicatorFits()
  root.unmount()
})

test("Space stays inside the numeric editor instead of reaching playback shortcuts", () => {
  const windowKeys: string[] = []
  let latest = 120
  const root = createTestRoot({
    width: 400,
    height: 180,
    onKeyDown: event => {
      windowKeys.push(event.key ?? "")
    },
  })
  root.render(
    <ThemeProvider>
      <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
        <DragPadNumber
          testId="pad"
          label="Numeric editor"
          value={120}
          onChange={value => {
            latest = value
          }}
          min={20}
          max={300}
          step={1}
        />
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
  root.renderer.nativeSimulateKeystrokes(root.renderer.findByTestId("pad")!.id, "enter")
  const editor = root.renderer.findByType("input")[0]!
  expect(root.renderer.getFocusedElementId()).toBe(editor.id)
  windowKeys.length = 0
  root.renderer.simulateKeystrokes("space")
  expect(windowKeys).toEqual([])
  expect(latest).toBe(120)
  expect(root.renderer.getFocusedElementId()).toBe(editor.id)
  root.unmount()
})
