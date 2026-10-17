import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { LevelMeter } from "."
import type { LevelMeterChannel, LevelMeterProps } from "."

const silence: readonly [LevelMeterChannel, LevelMeterChannel] = [
  { rmsDb: -120, peakDb: -120, holdDb: -120 },
  { rmsDb: -120, peakDb: -120, holdDb: -120 },
]

test("compact overload follows hold while the mixer readout latches until click reset", () => {
  const root = createTestRoot({ width: 240, height: 300 })
  let clipColor = ""
  let channels = silence
  function Fixture() {
    const theme = useTheme()
    clipColor = theme.colors.arrangementMeterClip
    return (
      <div style={{ display: "flex" }}>
        {(["track", "mixer"] as const).map(variant => (
          <LevelMeter
            key={variant}
            variant={variant}
            channels={channels}
            minDb={-120}
            maxDb={6}
            height={260}
            aria-label={variant}
            testId={part => `${variant}-${part}`}
          />
        ))}
      </div>
    )
  }
  const render = () =>
    root.render(
      <ThemeProvider>
        <Fixture />
      </ThemeProvider>
    )
  try {
    channels = [{ rmsDb: -8, peakDb: 3, holdDb: 3 }, silence[1]]
    render()
    expect(root.renderer.findByTestId("track-clip-left")?.style.backgroundColor).toBe(clipColor)
    expect(root.renderer.findByTestId("mixer-readout")?.style.backgroundColor).toBe(clipColor)
    channels = silence
    render()
    expect(root.renderer.findByTestId("track-clip-left")).toBeUndefined()
    expect(root.renderer.findByTestId("mixer-clip-left")).toBeUndefined()
    expect(root.renderer.findByTestId("mixer-readout")?.style.backgroundColor).toBe(clipColor)
    const readout = root.renderer.findByTestId("mixer-readout")
    const bounds = readout && root.renderer.getElementBounds(readout.id)
    if (!bounds) throw new Error("Missing peak readout")
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    root.renderer.nativeSimulateMouseMove(x, y)
    root.renderer.nativeSimulateClick(x, y)
    expect(root.renderer.findByTestId("mixer-readout")?.style.backgroundColor).not.toBe(clipColor)
    render()
    expect(root.renderer.findByTestId("mixer-readout")?.style.backgroundColor).not.toBe(clipColor)
    channels = [{ rmsDb: -9, peakDb: 1, holdDb: 1 }, silence[1]]
    render()
    expect(root.renderer.findByTestId("mixer-readout")?.style.backgroundColor).toBe(clipColor)
    channels = [{ rmsDb: -9, peakDb: -4, holdDb: 1 }, silence[1]]
    render()
    root.renderer.nativeSimulateMouseMove(x, y)
    root.renderer.nativeSimulateClick(x, y)
    expect(root.renderer.findByTestId("mixer-readout")?.style.backgroundColor).not.toBe(clipColor)
    channels = [{ rmsDb: -9, peakDb: -4, holdDb: 0.5 }, silence[1]]
    render()
    expect(root.renderer.findByTestId("track-clip-left")).toBeDefined()
    expect(root.renderer.findByTestId("mixer-readout")?.style.backgroundColor).not.toBe(clipColor)
  } finally {
    root.unmount()
  }
})

test("mixer height adds left ticks then right numbers without widening the bars", () => {
  const root = createTestRoot({ width: 300, height: 600 })
  let variant: LevelMeterProps["variant"] = "mixer"
  let height = 0
  let unit = 0
  let barsTop = 0
  let ticksHeight = 0
  let numbersHeight = 0
  function Fixture() {
    const theme = useTheme()
    const meter = theme.design.editor.meter
    unit = theme.control["--spacing-control-track"]
    barsTop = meter.readoutHeightUnits * unit + meter.readoutGap
    ticksHeight = meter.ticksMinHeightUnits * unit
    numbersHeight = meter.numbersMinHeightUnits * unit
    return (
      <LevelMeter
        variant={variant}
        channels={silence}
        minDb={-120}
        maxDb={6}
        height={height}
        testId={part => part}
      />
    )
  }
  const render = () =>
    root.render(
      <ThemeProvider>
        <Fixture />
      </ThemeProvider>
    )
  const barsWidth = () => root.renderer.findByTestId("bars")?.style.width
  try {
    render()
    height = ticksHeight - 1
    render()
    expect(root.renderer.findByTestId("tick-0")).toBeUndefined()
    expect(root.renderer.findByTestId("readout")).toBeUndefined()
    const compact = barsWidth()
    height = ticksHeight
    render()
    expect(root.renderer.findByTestId("tick-0")).toBeDefined()
    expect(root.renderer.findByTestId("number-0")).toBeUndefined()
    height = barsTop + numbersHeight
    render()
    expect(root.renderer.findByTestId("number-0")).toBeDefined()
    expect(root.renderer.findByTestId("readout")).toBeDefined()
    expect(barsWidth()).toBe(compact)
    variant = "track"
    height = numbersHeight
    render()
    const trackBars = barsWidth()
    expect(root.renderer.findByTestId("number-0")).toBeUndefined()
    variant = "collapsed"
    render()
    expect(barsWidth()).toBe(Number(trackBars) / 2)
    expect(root.renderer.findByTestId("tick-0")).toBeUndefined()
    variant = "inline"
    height = unit
    render()
    expect(root.renderer.findByTestId("tick-0")).toBeUndefined()
  } finally {
    root.unmount()
  }
})
