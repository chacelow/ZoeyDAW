import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Fader } from "."
import { visibleFaderTicks } from "./ticks"

const ticks = [-60, -30, -12, 0, 6].map(value => ({ value, label: String(value) }))

for (const input of [ticks, [...ticks].reverse()])
  test("crowded fader scales retain 0 dB rather than its colliding +6 label", () => {
    const visible = visibleFaderTicks(input, { min: -60, max: 6, travel: 105, lineHeight: 15 })
    expect(visible.some(tick => tick.value === 0)).toBe(true)
    expect(visible.some(tick => tick.value === 6)).toBe(false)
    expect(visible).toHaveLength(4)
  })

test("fader scale filtering retains non-colliding labels and handles a collapsed range", () => {
  expect(visibleFaderTicks(ticks, { min: -60, max: 6, travel: 660, lineHeight: 15 })).toEqual(ticks)
  expect(visibleFaderTicks(ticks, { min: 0, max: 0, travel: 105, lineHeight: 15 })).toEqual([
    { value: 0, label: "0" },
  ])
})

test("native fader labels do not overlap and the triangle-to-meter gap follows whole grid units", () => {
  const root = createTestRoot({ width: 300, height: 240 })
  let unit = 0
  let gapUnits = 0
  function Fixture() {
    const theme = useTheme()
    unit = theme.control["--spacing-control-track"]
    gapUnits = theme.design.fader.handleGapUnits
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
    expect(meter.x - triangleBox.x - triangleBox.width).toBeCloseTo(gapUnits * unit)
  } finally {
    root.unmount()
  }
})
