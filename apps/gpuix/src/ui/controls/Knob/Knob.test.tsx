import { afterEach, expect, test } from "bun:test"
import { useState } from "react"
import { handleGpuixEvent } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ControlEnvironmentProvider } from "../ControlEnvironment"
import { TEST_INPUT_POLICY } from "../DragPad/input-policy.test-fixture"
import { Switch } from "../Switch"
import { Knob, arcPath } from "."

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

function mountKnob(initial: number, bipolar = false) {
  const root = createTestRoot({ width: 300, height: 200 })
  roots.push(root)
  let latest = initial
  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <Knob
        testId="knob"
        label="Gain"
        value={value}
        onChange={next => {
          latest = next
          setValue(next)
        }}
        min={-1}
        max={1}
        step={0.01}
        defaultValue={0}
        bipolar={bipolar}
      />
    )
  }
  root.render(
    <ThemeProvider>
      <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
        <Harness />
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
  root.renderer.flush()
  const node = root.renderer.findByTestId("knob")
  const bounds = node && root.renderer.getElementBounds(node.id)
  if (!node || !bounds) throw new Error("Knob not painted")
  return {
    root,
    node,
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    value: () => latest,
    text: () => root.renderer.findByTestId("knob")?.customProps?.["aria-valuetext"],
  }
}

test("vertical drag turns the knob up and keyboard steps it back down", () => {
  const knob = mountKnob(0)
  knob.root.renderer.nativeSimulateMouseDown(knob.x, knob.y)
  knob.root.renderer.nativeSimulateMouseMove(
    knob.x,
    knob.y - TEST_INPUT_POLICY.dragPixelsPerStep * 10,
    0
  )
  knob.root.renderer.nativeSimulateMouseUp(
    knob.x,
    knob.y - TEST_INPUT_POLICY.dragPixelsPerStep * 10
  )
  expect(knob.value()).toBeCloseTo(0.1)
  knob.root.renderer.nativeSimulateKeystrokes(knob.node.id, "down")
  expect(knob.value()).toBeCloseTo(0.09)
  expect(knob.text()).toBe("0.09")
})

test("double-click resets to the default value", () => {
  const knob = mountKnob(0.5)
  handleGpuixEvent(
    {
      elementId: knob.node.id,
      eventType: "mouseDown",
      x: knob.x,
      y: knob.y,
      button: 0,
      clickCount: 2,
    },
    knob.root.renderer
  )
  expect(knob.value()).toBe(0)
})

test("a click never opens a text editor on the knob", () => {
  const knob = mountKnob(0)
  knob.root.renderer.nativeSimulateClick(knob.x, knob.y)
  knob.root.renderer.simulateKeystrokes("5")
  expect(knob.root.renderer.findByType("input")).toHaveLength(0)
  expect(knob.value()).toBe(0)
})

test("arcs are drawn between the origin and the value angle in either direction", () => {
  expect(arcPath(10, 8, 0, 0)).toBeNull()
  const forward = arcPath(10, 8, 0, 90)
  const backward = arcPath(10, 8, 90, 0)
  expect(forward).toBe(backward)
  expect(arcPath(10, 8, -150, 150)).toContain(" 0 1 1 ")
  expect(arcPath(10, 8, -30, 30)).toContain(" 0 0 1 ")
})

test("switch toggles by click and Space, ignores held repeats and stays inert when disabled", () => {
  const root = createTestRoot({ width: 200, height: 80 })
  roots.push(root)
  let latest = false
  let disabledLatest = false
  function Harness() {
    const [checked, setChecked] = useState(false)
    return (
      <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
        <Switch
          testId="switch"
          label="Monitor"
          checked={checked}
          onCheckedChange={next => {
            latest = next
            setChecked(next)
          }}
        />
        <Switch
          testId="switch-disabled"
          label="Off"
          checked={false}
          disabled
          onCheckedChange={next => {
            disabledLatest = next
          }}
        />
      </div>
    )
  }
  root.render(
    <ThemeProvider>
      <Harness />
    </ThemeProvider>
  )
  root.renderer.flush()
  const node = root.renderer.findByTestId("switch")
  const bounds = node && root.renderer.getElementBounds(node.id)
  if (!node || !bounds) throw new Error("Switch not painted")
  root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  expect(latest).toBe(true)
  expect(root.renderer.findByTestId("switch")?.customProps?.["aria-checked"]).toBe(true)
  root.renderer.nativeSimulateKeystrokes(node.id, "space")
  expect(latest).toBe(false)
  handleGpuixEvent(
    { elementId: node.id, eventType: "keyDown", key: "space", isHeld: true },
    root.renderer
  )
  expect(latest).toBe(false)
  const disabled = root.renderer.findByTestId("switch-disabled")
  const off = disabled && root.renderer.getElementBounds(disabled.id)
  if (!disabled || !off) throw new Error("Disabled switch not painted")
  root.renderer.nativeSimulateClick(off.x + off.width / 2, off.y + off.height / 2)
  root.renderer.nativeSimulateKeystrokes(disabled.id, "enter")
  expect(disabledLatest).toBe(false)
})
