import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { meterPosition, meterDbAtPosition } from "../LevelMeter"
import { Fader } from "."
import { ControlEnvironmentProvider } from "../ControlEnvironment"
import { TEST_INPUT_POLICY } from "../DragPad/input-policy.test-fixture"
import { visibleFaderTicks } from "./ticks"

const ticks = [-60, -30, -12, 0, 6].map(value => ({ value, label: String(value) }))
const scale = DEFAULT_DESIGN_TOKENS.editor.meter.scale

for (const input of [ticks, [...ticks].reverse()])
  test("crowded fader scales retain 0 dB rather than its colliding +6 label", () => {
    const visible = visibleFaderTicks(input, {
      min: -60,
      max: 6,
      scale,
      travel: 105,
      lineHeight: 15,
    })
    expect(visible.some(tick => tick.value === 0)).toBe(true)
    expect(visible.some(tick => tick.value === 6)).toBe(false)
    expect(visible).toHaveLength(4)
  })

test("fader scale filtering retains non-colliding labels and handles a collapsed range", () => {
  expect(
    visibleFaderTicks(ticks, { min: -60, max: 6, scale, travel: 660, lineHeight: 15 })
  ).toEqual(ticks)
  expect(visibleFaderTicks(ticks, { min: 0, max: 0, scale, travel: 105, lineHeight: 15 })).toEqual([
    { value: 0, label: "0" },
  ])
})

test("native fader labels do not overlap and triangle, ticks, meter, numbers follow Live order", () => {
  const root = createTestRoot({ width: 300, height: 240 })
  function Fixture() {
    return (
      <Fader
        testId="fader"
        label="Volume"
        min={-60}
        max={6}
        step={0.1}
        value={0}
        onChange={() => {}}
        ticks={ticks}
      />
    )
  }
  try {
    root.render(
      <ThemeProvider>
        <Fixture />
      </ThemeProvider>
    )
    expect(root.renderer.findByTestId("fader-tick-6")).toBeUndefined()
    expect(root.renderer.findByTestId("fader-tick-0")).toBeDefined()
    const visible = ticks
      .flatMap(tick => {
        const node = root.renderer.findByTestId(`fader-tick-${tick.value}`)
        const box = node && root.renderer.getElementBounds(node.id)
        return box ? [box] : []
      })
      .sort((a, b) => a.y - b.y)
    for (let index = 1; index < visible.length; index++)
      expect(visible[index].y - visible[index - 1].y).toBeGreaterThanOrEqual(
        visible[index - 1].height
      )
    const thumb = root.renderer.findByTestId("fader-thumb")!
    const triangle = root.renderer.findByType("svg").find(node => node.parentId === thumb.id)!
    const triangleBox = root.renderer.getElementBounds(triangle.id)!
    const meter = root.renderer.getElementBounds(
      root.renderer.findByTestId("fader-meter-area")!.id
    )!
    const dash = root.renderer.findByTestId("fader-dash-0")!
    const dashBox = root.renderer.getElementBounds(dash.id)!
    expect(triangleBox.x + triangleBox.width).toBeLessThanOrEqual(dashBox.x)
    expect(dashBox.x + dashBox.width).toBeLessThan(meter.x)
    expect(visible[0].x).toBeGreaterThanOrEqual(meter.x + meter.width)
  } finally {
    root.unmount()
  }
})

test("wheel over a fader scale label adjusts its controlled value", () => {
  const root = createTestRoot({ width: 300, height: 240 })
  let latest = 0
  function Fixture() {
    const [value, setValue] = useState(0)
    return (
      <Fader
        testId="fader"
        label="Volume"
        min={-60}
        max={6}
        step={1}
        value={value}
        onChange={next => {
          latest = next
          setValue(next)
        }}
        ticks={ticks}
      />
    )
  }
  try {
    root.render(
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
          <Fixture />
        </ControlEnvironmentProvider>
      </ThemeProvider>
    )
    const scale = root.renderer.findByTestId("fader-tick-0")
    const bounds = scale && root.renderer.getElementBounds(scale.id)
    if (!bounds) throw new Error("Fader scale not painted")
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    root.renderer.nativeSimulateMouseMove(x, y)
    root.renderer.nativeSimulateScrollWheel(x, y, 0, TEST_INPUT_POLICY.wheelLinePixels)
    expect(latest).toBe(1)
  } finally {
    root.unmount()
  }
})

test("fader drag follows the scale inverse while its −8 dB thumb shares meter positioning", () => {
  const root = createTestRoot({ width: 300, height: 240 })
  let latest = -8
  let travel = 0
  function Fixture() {
    const theme = useTheme()
    const unit = theme.control["--spacing-control-track"]
    travel = (theme.design.fader.lengthUnits - 1) * unit
    const [value, setValue] = useState(latest)
    return (
      <Fader
        label="Volume"
        testId="fader"
        min={-60}
        max={6}
        step={0.1}
        value={value}
        onChange={next => {
          latest = next
          setValue(next)
        }}
      />
    )
  }
  try {
    root.render(
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
          <Fixture />
        </ControlEnvironmentProvider>
      </ThemeProvider>
    )
    expect(root.renderer.findByTestId("fader-thumb")?.style.top).toBeCloseTo(
      meterPosition(-8, scale) * travel
    )
    const node = root.renderer.findByTestId("fader")!
    const box = root.renderer.getElementBounds(node.id)!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const delta = travel * 0.1
    root.renderer.nativeSimulateMouseMove(x, y)
    root.renderer.nativeSimulateMouseDown(x, y)
    root.renderer.nativeSimulateMouseMove(x, y + delta, 0)
    root.renderer.nativeSimulateMouseUp(x, y + delta)
    const expected =
      Math.round(meterDbAtPosition(meterPosition(-8, scale) + delta / travel, scale) * 10) / 10
    expect(latest).toBeCloseTo(expected)
  } finally {
    root.unmount()
  }
})
