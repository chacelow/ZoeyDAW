import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Button, Checkbox, Chip, Switch, Knob, Fader, DragPadNumber, DropdownButton } from "."
import { Icon } from "./Icon"

test("control and transport sizes occupy whole control-grid units", () => {
  const root = createTestRoot({ width: 1800, height: 400 })
  let unit = 0
  function Controls() {
    const theme = useTheme()
    unit = theme.control["--spacing-control-track"]
    return (
      <div style={{ display: "flex", alignItems: "start", gap: unit }}>
        <Button testId="button">A long label must never widen the button</Button>
        <Button testId="icon" iconOnly label="Play" icon={<Icon name="Play" />} />
        <Button testId="transport" size="transport">
          Play
        </Button>
        <Switch testId="switch" label="Switch" checked={false} onCheckedChange={() => {}} />
        <Switch
          testId="transport-switch"
          size="transport"
          label="Switch"
          checked={false}
          onCheckedChange={() => {}}
        />
        <Checkbox testId="checkbox" checked="mixed" onCheckedChange={() => {}} />
        <Chip testId="chip">A long tag must remain in its grid slot</Chip>
        <Knob testId="knob" label="Knob" min={0} max={100} step={1} value={0} onChange={() => {}} />
        <Knob
          testId="transport-knob"
          size="transport"
          label="Knob"
          min={0}
          max={100}
          step={1}
          value={0}
          onChange={() => {}}
        />
        <Fader
          testId="fader"
          label="Fader"
          min={-60}
          max={6}
          step={0.1}
          value={0}
          onChange={() => {}}
        />
        <DragPadNumber
          testId="number"
          label="Number"
          min={0}
          max={999}
          step={1}
          value={0}
          onChange={() => {}}
        />
        <DropdownButton
          testId="dropdown"
          label="Route"
          value="one"
          onChange={() => {}}
          items={[{ id: "one", label: "A considerably longer route" }]}
        />
      </div>
    )
  }
  try {
    root.render(
      <ThemeProvider>
        <Controls />
      </ThemeProvider>
    )
    for (let frame = 0; frame < 4; frame++) {
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    for (const id of [
      "button",
      "icon",
      "transport",
      "switch",
      "transport-switch",
      "checkbox",
      "chip",
      "knob",
      "transport-knob",
      "fader",
      "number",
      "dropdown",
    ]) {
      const node = root.renderer.findByTestId(id)!
      const bounds = root.renderer.getElementBounds(node.id)!
      expect({ id, width: bounds.width / unit }).toEqual({
        id,
        width: Math.round(bounds.width / unit),
      })
      expect({ id, height: bounds.height / unit }).toEqual({
        id,
        height: Math.round(bounds.height / unit),
      })
    }
    const icon = root.renderer.getElementBounds(root.renderer.findByTestId("icon")!.id)!
    expect([icon.width, icon.height]).toEqual([unit, unit])
    const toggle = root.renderer.getElementBounds(root.renderer.findByTestId("switch")!.id)!
    expect([toggle.width, toggle.height]).toEqual([2 * unit, unit])
  } finally {
    root.unmount()
  }
})
