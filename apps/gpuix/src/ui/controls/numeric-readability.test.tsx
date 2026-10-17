import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { createDisplayFormats } from "@/app/i18n"
import { Knob, DragPadNumber, DragPadBar, DragPadBipolar, PanControl } from "."

const formats = createDisplayFormats("en-US")

test("Knob fits the full Volume label while keeping its dial at two grid units", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  let unit = 0
  function Fixture() {
    const theme = useTheme()
    unit = theme.control["--spacing-control-track"]
    return (
      <div style={{ display: "flex", alignItems: "start" }}>
        <Knob testId="knob" label="Volume" min={0} max={1} step={1} value={0} onChange={() => {}} />
        <text
          testId="label-reference"
          style={{ fontSize: theme.control["--text-control-track"], whiteSpace: "nowrap" }}
        >
          Volume
        </text>
      </div>
    )
  }
  try {
    root.render(
      <ThemeProvider>
        <Fixture />
      </ThemeProvider>
    )
    for (let frame = 0; frame < 4; frame++) {
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    const reference = root.renderer.getElementBounds(
      root.renderer.findByTestId("label-reference")!.id
    )!
    const knob = root.renderer.getElementBounds(root.renderer.findByTestId("knob")!.id)!
    expect(knob.width).toBe(Math.ceil(Math.max(unit * 2, reference.width) / unit) * unit)
    expect(knob.width).toBeGreaterThanOrEqual(reference.width)
    const dial = root.renderer.findByType("svg")[0]!
    expect(root.renderer.getElementBounds(dial.id)!.width).toBe(unit * 2)
  } finally {
    root.unmount()
  }
})

test("default number, bar, bipolar and PanControl share a fitting minimum grid width", () => {
  const root = createTestRoot({ width: 640, height: 180 })
  let minimumWidth = 0
  function Fixture() {
    const theme = useTheme()
    minimumWidth = theme.design.grid.numericWidthUnits * theme.control["--spacing-control-track"]
    const props = {
      label: "Volume",
      value: 0,
      onChange: () => {},
      min: -60,
      max: 6,
      step: 0.1,
      format: formats.db,
      widthSamples: formats.widthSamples.db,
    }
    return (
      <div style={{ display: "flex" }}>
        <DragPadNumber {...props} testId="number" />
        <DragPadBar {...props} testId="bar" />
        <DragPadBipolar {...props} testId="bipolar" />
        <PanControl
          testId="pan"
          label="Pan"
          value={0}
          onChange={() => {}}
          format={value => formats.pan(value, "control")}
          parse={formats.parsePan}
          widthSamples={formats.widthSamples.pan}
        />
      </div>
    )
  }
  try {
    root.render(
      <ThemeProvider>
        <Fixture />
      </ThemeProvider>
    )
    for (let frame = 0; frame < 4; frame++) {
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    const widths = ["number", "bar", "bipolar", "pan"].map(
      id => root.renderer.getElementBounds(root.renderer.findByTestId(id)!.id)!.width
    )
    expect(new Set(widths).size).toBe(1)
    expect(widths[0]).toBe(minimumWidth)
  } finally {
    root.unmount()
  }
})

for (const appearance of ["dark", "light"] as const)
  test(`numeric fills use a stronger actual raster in ${appearance} and retain readable full-bar values`, () => {
    const root = createTestRoot({ width: 300, height: 120 })
    const directory = mkdtempSync(path.join(tmpdir(), "numeric-fill-"))
    const image = path.join(directory, "frame.png")
    let foreground = ""
    function Fixture() {
      const theme = useTheme()
      foreground = theme.colors.primaryForeground
      return (
        <div
          style={{
            display: "flex",
            alignItems: "start",
            backgroundColor: theme.colors.background,
            width: "100%",
            height: "100%",
            padding: theme.control["--spacing-control-track"],
          }}
        >
          <DragPadBar
            testId="bar"
            label="Volume"
            value={100}
            onChange={() => {}}
            min={0}
            max={100}
            step={1}
          />
          <DragPadBipolar
            testId="bipolar"
            label="Bipolar"
            value={0.75}
            onChange={() => {}}
            min={-1}
            max={1}
            step={0.01}
          />
        </div>
      )
    }
    try {
      root.render(
        <ThemeProvider appearance={appearance}>
          <Fixture />
        </ThemeProvider>
      )
      for (let frame = 0; frame < 4; frame++) {
        root.renderer.flush()
        root.renderer.dispatchNativeEvents()
      }
      expect(root.renderer.findByTestId("bar-fill")!.style.opacity).toBeGreaterThanOrEqual(0.5)
      expect(
        root.renderer.getElementBounds(root.renderer.findByTestId("bipolar-fill")!.id)!.width
      ).toBeGreaterThan(0)
      expect(root.renderer.findByTestId("bar-value")!.style.color).toBe(foreground)
      root.renderer.captureScreenshot(image)
      const stronger = readFileSync(image)
      root.render(
        <ThemeProvider
          appearance={appearance}
          design={{
            ...DEFAULT_DESIGN_TOKENS,
            dragPad: { ...DEFAULT_DESIGN_TOKENS.dragPad, fillOpacity: 0.3 },
          }}
        >
          <Fixture />
        </ThemeProvider>
      )
      root.renderer.captureScreenshot(image)
      expect(readFileSync(image).equals(stronger)).toBe(false)
    } finally {
      root.unmount()
      rmSync(directory, { recursive: true, force: true })
    }
  })
