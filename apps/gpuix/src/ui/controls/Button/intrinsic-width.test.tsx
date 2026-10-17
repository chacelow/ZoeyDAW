import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "."
import { Icon } from "../Icon"

const LABELS = ["New from template", "Import audio"]

test("text buttons use the smallest fitting grid width including icon, padding and border overrides", () => {
  const root = createTestRoot({ width: 800, height: 240 })
  let unit = 0
  let overhead = 0
  let iconOverhead = 0
  function Fixture() {
    const theme = useTheme()
    const metrics = theme.control
    unit = metrics["--spacing-control-track"]
    overhead =
      metrics["--spacing-control-track-pad"] * 2 + theme.design.shape.controlBorderWidth * 2
    iconOverhead =
      unit * 2 +
      theme.design.shape.controlBorderWidth * 2 +
      metrics["--spacing-control-icon-slot"] +
      unit
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "start" }}>
        {LABELS.map((label, index) => (
          <Button key={label} testId={`button-${index}`}>
            {label}
          </Button>
        ))}
        <Button
          testId="icon-label"
          icon={<Icon name="Plus" />}
          style={{ paddingLeft: unit, paddingRight: unit, gap: unit }}
        >
          {LABELS[0]}
        </Button>
        {LABELS.map((label, index) => (
          <text
            key={label}
            testId={`reference-${index}`}
            style={{ fontSize: metrics["--text-control-track"], whiteSpace: "nowrap" }}
          >
            {label}
          </text>
        ))}
        <Button testId="icon-only" iconOnly label={LABELS[0]} icon={<Icon name="Plus" />} />
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
    for (const index of [0, 1]) {
      const reference = root.renderer.getElementBounds(
        root.renderer.findByTestId(`reference-${index}`)!.id
      )!
      const button = root.renderer.getElementBounds(
        root.renderer.findByTestId(`button-${index}`)!.id
      )!
      const required = Math.ceil(reference.width) + overhead
      expect(button.width).toBe(Math.ceil(required / unit) * unit)
      expect(button.width).toBeGreaterThanOrEqual(required)
      expect(button.width - unit).toBeLessThan(required)
    }
    const reference = root.renderer.getElementBounds(root.renderer.findByTestId("reference-0")!.id)!
    const iconLabel = root.renderer.getElementBounds(root.renderer.findByTestId("icon-label")!.id)!
    expect(iconLabel.width).toBe(
      Math.ceil((Math.ceil(reference.width) + iconOverhead) / unit) * unit
    )
    const iconOnly = root.renderer.getElementBounds(root.renderer.findByTestId("icon-only")!.id)!
    expect([iconOnly.width, iconOnly.height]).toEqual([unit, unit])
  } finally {
    root.unmount()
  }
})

test("text buttons only truncate when their available width is constrained", () => {
  const root = createTestRoot({ width: 640, height: 240 })
  let constrainedWidth = 0
  let activated = 0
  const label = "New from template"
  function Fixture() {
    const theme = useTheme()
    constrainedWidth = theme.control["--spacing-control-track"] * 3
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "start" }}>
        <Button testId="natural">{label}</Button>
        <div style={{ display: "flex", width: constrainedWidth }}>
          <Button
            testId="constrained"
            onClick={() => {
              activated++
            }}
          >
            {label}
          </Button>
        </div>
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
    const original = root.renderer.getAllText().filter(text => text === label).length
    const natural = root.renderer.getElementBounds(root.renderer.findByTestId("natural")!.id)!
    const constrained = root.renderer.getElementBounds(
      root.renderer.findByTestId("constrained")!.id
    )!
    expect(natural.width).toBeGreaterThan(constrained.width)
    expect(constrained.width).toBe(constrainedWidth)
    root.renderer.nativeSimulateMouseMove(600, 220)
    root.renderer.nativeSimulateMouseMove(
      natural.x + natural.width / 2,
      natural.y + natural.height / 2
    )
    expect(root.renderer.getAllText().filter(text => text === label)).toHaveLength(original)
    root.renderer.nativeSimulateMouseMove(600, 220)
    root.renderer.nativeSimulateMouseMove(
      constrained.x + constrained.width / 2,
      constrained.y + constrained.height / 2
    )
    expect(root.renderer.getAllText().filter(text => text === label)).toHaveLength(original + 1)
    root.renderer.nativeSimulateClick(
      constrained.x + constrained.width / 2,
      constrained.y + constrained.height / 2
    )
    expect(activated).toBe(1)
  } finally {
    root.unmount()
  }
})
