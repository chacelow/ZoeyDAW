import { describe, expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DragPadNumber } from "./DragPadNumber"

function mount({
  initial = 0,
  min = -10,
  max = 10,
  dragStep,
}: { initial?: number; min?: number; max?: number; dragStep?: number } = {}) {
  const root = createTestRoot({ width: 400, height: 180 })
  let latest = initial
  const gestures: string[] = []
  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <ThemeProvider>
        <DragPadNumber
          label="Precision"
          testId="precision"
          value={value}
          min={min}
          max={max}
          step={0.01}
          dragStep={dragStep}
          onChange={next => {
            latest = next
            setValue(next)
          }}
          onGestureStart={() => {
            gestures.push("start")
          }}
          onGestureEnd={() => {
            gestures.push("end")
          }}
          onGestureCancel={() => {
            gestures.push("cancel")
          }}
        />
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  const pad = root.renderer.findByTestId("precision")
  if (!pad) throw new Error("Missing precision pad")
  const bounds = root.renderer.getElementBounds(pad.id)
  if (!bounds) throw new Error("Unpainted precision pad")
  return {
    ...root,
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    value: () => latest,
    gestures,
  }
}

describe("DragPadNumber independent motion precision", () => {
  test("four upward native pixels use dragStep, not typed precision", () => {
    const a = mount({ dragStep: 1 })
    try {
      a.renderer.nativeSimulateMouseDown(a.x, a.y)
      a.renderer.nativeSimulateMouseMove(a.x, a.y - 4, 0)
      expect(a.value()).toBe(1)
      a.renderer.nativeSimulateMouseUp(a.x, a.y - 4)
      expect(a.value()).toBe(1)
      expect(a.gestures).toEqual(["start", "end"])
      expect(a.renderer.getAllText()).toContain("1.00")
    } finally {
      a.unmount()
    }
  })

  test("raw positive sixteen wheel units use dragStep", () => {
    const a = mount({ dragStep: 1 })
    try {
      a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, 16)
      expect(a.value()).toBe(1)
      expect(a.gestures).toEqual(["start", "end"])
      expect(a.renderer.getAllText()).toContain("1.00")
    } finally {
      a.unmount()
    }
  })

  test("typed decimals and keyboard arrows retain step precision", () => {
    const a = mount({ dragStep: 1 })
    try {
      a.renderer.nativeSimulateClick(a.x, a.y)
      a.renderer.simulateKeystrokes("2")
      a.renderer.simulateKeystrokes(".")
      a.renderer.simulateKeystrokes("3")
      a.renderer.simulateKeystrokes("7")
      a.renderer.simulateKeystrokes("enter")
      expect(a.value()).toBe(2.37)
      expect(a.renderer.findByType("input")).toHaveLength(0)
      expect(a.renderer.getAllText()).toContain("2.37")
      const pad = a.renderer.findByTestId("precision")
      if (!pad) throw new Error("Missing committed precision pad")
      a.renderer.nativeSimulateKeystrokes(pad.id, "up")
      expect(a.value()).toBe(2.38)
      expect(a.renderer.getAllText()).toContain("2.38")
    } finally {
      a.unmount()
    }
  })

  test("omitting dragStep keeps fine native drag and wheel motion", () => {
    const a = mount()
    try {
      a.renderer.nativeSimulateMouseDown(a.x, a.y)
      a.renderer.nativeSimulateMouseMove(a.x, a.y - 4, 0)
      a.renderer.nativeSimulateMouseUp(a.x, a.y - 4)
      expect(a.value()).toBe(0.01)
      a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, 16)
      expect(a.value()).toBe(0.02)
      expect(a.renderer.getAllText()).toContain("0.02")
    } finally {
      a.unmount()
    }
  })

  test("coarse drag and wheel motion clamp to fractional range endpoints", () => {
    const a = mount({ dragStep: 1, min: -0.25, max: 0.75 })
    try {
      a.renderer.nativeSimulateMouseDown(a.x, a.y)
      a.renderer.nativeSimulateMouseMove(a.x, a.y - 4, 0)
      a.renderer.nativeSimulateMouseUp(a.x, a.y - 4)
      expect(a.value()).toBe(0.75)
      a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, -32)
      expect(a.value()).toBe(-0.25)
    } finally {
      a.unmount()
    }
  })

  test("fractional starts inherit the motion lattice and Escape restores the typed value", () => {
    const a = mount({ initial: 0.25, dragStep: 1 })
    try {
      a.renderer.nativeSimulateMouseDown(a.x, a.y)
      a.renderer.nativeSimulateMouseMove(a.x, a.y - 4, 0)
      expect(a.value()).toBe(1)
      a.renderer.simulateKeystrokes("escape")
      expect(a.value()).toBe(0.25)
      a.renderer.nativeSimulateMouseUp(a.x, a.y - 4)
      expect(a.value()).toBe(0.25)
      expect(a.gestures).toEqual(["start", "cancel"])
      a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, 16)
      expect(a.value()).toBe(1)
    } finally {
      a.unmount()
    }
  })
})
