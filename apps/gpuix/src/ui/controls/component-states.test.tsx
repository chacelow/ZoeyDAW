import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { handleGpuixEvent } from "@gpuix/react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_THEME_PRESET, getThemePreset } from "@/shared/theme/presets"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { meterPosition, meterDbAtPosition } from "./LevelMeter"
import { Checkbox } from "./Checkbox"
import { TreeRow } from "./TreeRow"
import { Chip } from "./Chip"
import { Fader } from "./Fader"
import { Button } from "./Button"
import { ControlEnvironmentProvider } from "./ControlEnvironment"
import { TEST_INPUT_POLICY } from "./DragPad/input-policy.test-fixture"

test("Checkbox mixed becomes checked; Space and Enter toggle once; disabled blocks both", () => {
  const root = createTestRoot({ width: 300, height: 100 })
  function Harness() {
    const [checked, setChecked] = useState<boolean | "mixed">("mixed")
    return (
      <ThemeProvider>
        <div style={{ display: "flex" }}>
          <Checkbox
            testId="check"
            checked={checked}
            onCheckedChange={setChecked}
            label="Selection"
          />
          <Checkbox
            testId="disabled"
            checked="mixed"
            onCheckedChange={() => {
              throw new Error("Disabled checkbox toggled")
            }}
            disabled
          />
        </div>
      </ThemeProvider>
    )
  }
  try {
    root.render(<Harness />)
    const node = root.renderer.findByTestId("check")!
    expect(node.customProps?.["aria-checked"]).toBe("mixed")
    root.renderer.nativeSimulateKeystrokes(node.id, "space")
    expect(root.renderer.getElement(node.id)?.customProps?.["aria-checked"]).toBe(true)
    root.renderer.nativeSimulateKeystrokes(node.id, "enter")
    expect(root.renderer.getElement(node.id)?.customProps?.["aria-checked"]).toBe(false)
    const bounds = root.renderer.getElementBounds(node.id)!
    root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    expect(root.renderer.getElement(node.id)?.customProps?.["aria-checked"]).toBe(true)
    const disabled = root.renderer.findByTestId("disabled")!
    root.renderer.nativeSimulateKeystrokes(disabled.id, "space")
    root.renderer.nativeSimulateKeystrokes(disabled.id, "enter")
  } finally {
    root.unmount()
  }
})

test("TreeRow Left/Right collapse/expand and do not emit redundant state changes", () => {
  const root = createTestRoot({ width: 300, height: 100 })
  const changes: boolean[] = []
  function Harness() {
    const [expanded, setExpanded] = useState(false)
    return (
      <ThemeProvider>
        <TreeRow
          testId="tree"
          label="Folder"
          expanded={expanded}
          onExpandedChange={value => {
            changes.push(value)
            setExpanded(value)
          }}
        />
      </ThemeProvider>
    )
  }
  try {
    root.render(<Harness />)
    const node = root.renderer.findByTestId("tree")!
    root.renderer.nativeSimulateKeystrokes(node.id, "right")
    expect(root.renderer.getElement(node.id)?.customProps?.["aria-expanded"]).toBe(true)
    root.renderer.nativeSimulateKeystrokes(node.id, "right")
    root.renderer.nativeSimulateKeystrokes(node.id, "left")
    expect(root.renderer.getElement(node.id)?.customProps?.["aria-expanded"]).toBe(false)
    expect(changes).toEqual([true, false])
  } finally {
    root.unmount()
  }
})

test("Chip removal does not select the chip", () => {
  const root = createTestRoot({ width: 300, height: 100 })
  let selected = 0
  function Harness() {
    const [visible, setVisible] = useState(true)
    return (
      <ThemeProvider>
        {visible ? (
          <Chip
            testId="chip"
            onSelectedChange={() => {
              selected++
            }}
            remove={{ label: "Remove drums", onRemove: () => setVisible(false) }}
          >
            Drums
          </Chip>
        ) : null}
      </ThemeProvider>
    )
  }
  try {
    root.render(<Harness />)
    const remove = root.renderer
      .findByType("div")
      .find(node => node.customProps?.["aria-label"] === "Remove drums")!
    const chip = root.renderer.findByTestId("chip")!
    const chipBounds = root.renderer.getElementBounds(chip.id)!
    const removeBounds = root.renderer.getElementBounds(remove.id)!
    expect(removeBounds.x).toBeGreaterThan(chipBounds.x)
    expect(removeBounds.x + removeBounds.width).toBeLessThanOrEqual(chipBounds.x + chipBounds.width)
    expect(removeBounds.y).toBeGreaterThanOrEqual(chipBounds.y)
    expect(removeBounds.y + removeBounds.height).toBeLessThanOrEqual(
      chipBounds.y + chipBounds.height
    )
    root.renderer.nativeSimulateKeystrokes(remove.id, "enter")
    expect(root.renderer.findByTestId("chip")).toBeUndefined()
    expect(selected).toBe(0)
  } finally {
    root.unmount()
  }
})

for (const appearance of ["light", "dark"] as const)
  test(`Button active tones resolve theme roles in ${appearance}`, () => {
    const root = createTestRoot({ width: 300, height: 100 })
    const colors = getThemePreset(DEFAULT_THEME_PRESET).colors[appearance]
    try {
      root.render(
        <ThemeProvider appearance={appearance}>
          <div style={{ display: "flex" }}>
            {(["solo", "arm", "activator"] as const).map(tone => (
              <Button key={tone} testId={tone} active tone={tone}>
                {tone}
              </Button>
            ))}
          </div>
        </ThemeProvider>
      )
      expect(root.renderer.findByTestId("solo")!.style.backgroundColor).toBe(colors.soloActive)
      expect(root.renderer.findByTestId("arm")!.style.backgroundColor).toBe(colors.armActive)
      expect(root.renderer.findByTestId("activator")!.style.backgroundColor).toBe(
        colors.activatorActive
      )
    } finally {
      root.unmount()
    }
  })

for (const surface of ["thumb", "meter-area"] as const)
  test(`Fader ${surface} drag/wheel/keyboard/reset and triangle position track the value`, () => {
    const root = createTestRoot({ width: 400, height: 240 })
    let latest = -8
    function Harness() {
      const [value, setValue] = useState(-8)
      return (
        <ThemeProvider>
          <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
            <Fader
              testId="fader"
              label="Volume"
              value={value}
              onChange={next => {
                latest = next
                setValue(next)
              }}
              min={-60}
              max={6}
              step={1}
              defaultValue={-8}
            />
          </ControlEnvironmentProvider>
        </ThemeProvider>
      )
    }
    try {
      root.render(<Harness />)
      const node = root.renderer.findByTestId("fader")!
      const bounds = root.renderer.getElementBounds(node.id)!
      const surfaceBounds = root.renderer.getElementBounds(
        root.renderer.findByTestId(`fader-${surface}`)!.id
      )!
      const x = surfaceBounds.x + surfaceBounds.width / 2
      const y = bounds.y + bounds.height / 2
      const before = root.renderer.findByTestId("fader-thumb")!.style
      root.renderer.nativeSimulateMouseMove(x, y)
      root.renderer.nativeSimulateMouseDown(x, y)
      root.renderer.nativeSimulateMouseMove(x, y - 8, 0)
      root.renderer.nativeSimulateMouseUp(x, y - 8)
      const travel = bounds.height - Number(before.height)
      const scale = DEFAULT_DESIGN_TOKENS.editor.meter.scale
      const dragged = Math.round(meterDbAtPosition(meterPosition(-8, scale) - 8 / travel, scale))
      expect(latest).toBe(dragged)
      const moved = root.renderer.findByTestId("fader-thumb")!.style
      expect(Number(moved.top)).toBeLessThan(Number(before.top))
      expect(Number(moved.top)).toBeCloseTo(meterPosition(latest, scale) * travel)
      root.renderer.nativeSimulateScrollWheel(x, y, 0, 16)
      expect(latest).toBe(dragged + 1)
      root.renderer.nativeSimulateKeystrokes(node.id, "up")
      expect(latest).toBe(dragged + 2)
      root.renderer.nativeSimulateKeystrokes(node.id, "home")
      expect(latest).toBe(-60)
      root.renderer.nativeSimulateKeystrokes(node.id, "end")
      expect(latest).toBe(6)
      const endpoint = root.renderer.findByTestId("fader-thumb")!.style
      expect(endpoint.top).toBe(0)
      handleGpuixEvent(
        { elementId: node.id, eventType: "mouseDown", x, y, button: 0, clickCount: 2 },
        root.renderer
      )
      expect(latest).toBe(-8)
      root.render(<Harness />)
      expect(Number(root.renderer.findByTestId("fader-thumb")!.style.top)).toBeCloseTo(
        meterPosition(-8, scale) * travel
      )
    } finally {
      root.unmount()
    }
  })
