// @vitest-environment jsdom
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DragPadNumber } from "@zoeymind/ui"

afterEach(cleanup)

function NumericConsumer() {
  const [value, setValue] = useState(2)
  return (
    <DragPadNumber
      label="Numeric value"
      value={value}
      onChange={setValue}
      min={0}
      max={10}
      step={1}
      defaultValue={5}
      icon={<span>Icon</span>}
    />
  )
}

describe("shared numeric keyboard activation", () => {
  it("keeps a pre-edit button until typing and then focuses the live editor", () => {
    render(<NumericConsumer />)
    const button = screen.getByRole("button", { name: "Numeric value" })
    button.focus()
    fireEvent.click(button, { detail: 0 })
    expect(screen.queryByRole("textbox", { name: "Numeric value" })).toBeNull()
    fireEvent.keyDown(button, { key: "5", code: "Digit5" })
    const editor = screen.getByRole("textbox", { name: "Numeric value" })
    expect(editor).toHaveProperty("value", "5")
    expect(document.activeElement).toBe(editor)
    expect(screen.getByText("Icon")).toBeTruthy()
  })

  it("retains the pre-edit button for pointer clicks and double-click reset", () => {
    render(<NumericConsumer />)
    const button = screen.getByRole("button", { name: "Numeric value" })
    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    const up = new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 100, clientY: 100 })
    Object.defineProperty(down, "pointerId", { value: 1 })
    Object.defineProperty(up, "pointerId", { value: 1 })
    fireEvent(button, down)
    fireEvent(document, up)
    expect(screen.getByRole("button", { name: "Numeric value" })).toBe(button)
    expect(screen.queryByRole("textbox", { name: "Numeric value" })).toBeNull()
    fireEvent.doubleClick(button)
    expect(screen.getByText("5")).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: "Numeric value" })).toBeNull()
    fireEvent.click(button, { detail: 0 })
    fireEvent.keyDown(button, { key: "3", code: "Digit3" })
    expect(screen.getByRole("textbox", { name: "Numeric value" })).toHaveProperty("value", "3")
  })
})
