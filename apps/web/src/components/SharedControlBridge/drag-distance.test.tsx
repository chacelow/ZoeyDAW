// @vitest-environment jsdom
import { useState } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { DragPadBipolar } from "@zoeymind/ui"

afterEach(cleanup)

function DistanceConsumer() {
  const [value, setValue] = useState(0)
  return (
    <>
      <DragPadBipolar label="Pan" value={value} onChange={setValue} min={-1} max={1} step={0.01} />
      <output data-testid="value">{value}</output>
    </>
  )
}

function pointer(target: Element | Document, type: string, y: number, shiftKey = false) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 100,
    clientY: y,
    shiftKey,
  })
  Object.defineProperty(event, "pointerId", { value: 1 })
  fireEvent(target, event)
}

function value() {
  return Number(screen.getByTestId("value").textContent)
}

it("uses traveled distance rather than pointer event frequency", () => {
  const results: number[] = []
  for (const distances of [[40], [4, 10, 25, 40]]) {
    const view = render(<DistanceConsumer />)
    pointer(screen.getByRole("button", { name: "Pan" }), "pointerdown", 600)
    for (const distance of distances) pointer(document, "pointermove", 600 - distance)
    pointer(document, "pointerup", 560)
    results.push(value())
    view.unmount()
  }
  expect(results).toEqual([0.4, 0.4])
})

it("responds immediately when reversing after dragging beyond either boundary", () => {
  render(<DistanceConsumer />)
  pointer(screen.getByRole("button", { name: "Pan" }), "pointerdown", 600)
  pointer(document, "pointermove", 100)
  expect(value()).toBe(1)
  pointer(document, "pointermove", 101)
  expect(value()).toBeCloseTo(0.99)
  pointer(document, "pointermove", 701)
  expect(value()).toBe(-1)
  pointer(document, "pointermove", 700)
  expect(value()).toBeCloseTo(-0.99)
  pointer(document, "pointerup", 700)
})

it("retains Shift fine adjustment using the same distance scale", () => {
  render(<DistanceConsumer />)
  pointer(screen.getByRole("button", { name: "Pan" }), "pointerdown", 600, true)
  pointer(document, "pointermove", 560, true)
  expect(value()).toBeCloseTo(0.04)
  pointer(document, "pointerup", 560, true)
})
