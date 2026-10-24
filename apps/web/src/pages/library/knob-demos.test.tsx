// @vitest-environment jsdom
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DragPadNumber, Knob } from "@zoeymind/ui"

afterEach(cleanup)

function KnobConsumer({
  disabled = false,
  readOnly = false,
}: {
  disabled?: boolean
  readOnly?: boolean
}) {
  const [value, setValue] = useState(2)
  return (
    <>
      <Knob
        label="Gain knob"
        value={value}
        onChange={setValue}
        min={-10}
        max={10}
        step={1}
        defaultValue={0}
        disabled={disabled}
        readOnly={readOnly}
        icon={<span>Persistent icon</span>}
        parse={raw => (/^-?\d+$/.test(raw) ? Number(raw) : Number.NaN)}
      />
      <output data-testid="value">{value}</output>
    </>
  )
}

function pointer(target: Element | Document, type: string, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 100, clientY: y })
  Object.defineProperty(event, "pointerId", { value: 1 })
  fireEvent(target, event)
}

describe("shared-family Knob consumer", () => {
  it("adjusts only focused knob keyboard input and clamps Home/End", () => {
    render(<KnobConsumer />)
    const knob = screen.getByRole("slider", { name: "Gain knob" })
    fireEvent.keyDown(knob, { key: "Home" })
    expect(screen.getByTestId("value").textContent).toBe("2")
    knob.focus()
    fireEvent.keyDown(knob, { key: "ArrowUp" })
    expect(screen.getByTestId("value").textContent).toBe("3")
    fireEvent.keyDown(knob, { key: "Home" })
    expect(screen.getByTestId("value").textContent).toBe("-10")
    fireEvent.keyDown(knob, { key: "End" })
    expect(screen.getByTestId("value").textContent).toBe("10")
  })

  it("continues wheel adjustment from a keyboard-updated value", () => {
    function PercentKnob() {
      const [value, setValue] = useState(35)
      return (
        <Knob label="Percent knob" value={value} onChange={setValue} min={0} max={100} step={1} />
      )
    }
    render(<PercentKnob />)
    const knob = screen.getByRole("slider", { name: "Percent knob" })
    knob.focus()
    fireEvent.keyDown(knob, { key: "End" })
    expect(knob.getAttribute("aria-valuenow")).toBe("100")
    fireEvent.wheel(knob, { deltaY: 40 })
    expect(knob.getAttribute("aria-valuenow")).toBe("99")
  })

  it("keeps Shift keyboard adjustment usable for discrete steps", () => {
    render(<KnobConsumer />)
    const knob = screen.getByRole("slider", { name: "Gain knob" })
    knob.focus()
    fireEvent.keyDown(knob, { key: "ArrowUp", shiftKey: true })
    expect(screen.getByTestId("value").textContent).toBe("3")
    fireEvent.keyDown(knob, { key: "ArrowDown", shiftKey: true })
    expect(screen.getByTestId("value").textContent).toBe("2")
  })

  it("uses live distance drag, wheel and double-click reset from the shared family", () => {
    render(<KnobConsumer />)
    const knob = screen.getByRole("slider", { name: "Gain knob" })
    pointer(knob, "pointerdown", 100)
    pointer(document, "pointermove", 95)
    expect(screen.getByTestId("value").textContent).toBe("7")
    pointer(document, "pointerup", 95)
    expect(screen.getByTestId("value").textContent).toBe("7")
    fireEvent.wheel(knob, { deltaY: 40 })
    expect(screen.getByTestId("value").textContent).toBe("6")
    fireEvent.doubleClick(knob)
    expect(screen.getByTestId("value").textContent).toBe("0")
  })

  it("preserves icon and invalid draft state and Escape restores the original value", () => {
    render(<KnobConsumer />)
    const knob = screen.getByRole("slider", { name: "Gain knob" })
    knob.focus()
    fireEvent.click(knob, { detail: 0 })
    fireEvent.keyDown(knob, { key: "5" })
    const input = screen.getByRole("textbox", { name: "Gain knob" })
    expect(screen.getByText("Persistent icon")).toBeTruthy()
    expect(screen.getByTestId("value").textContent).toBe("5")
    fireEvent.change(input, { target: { value: "5x" } })
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByTestId("value").textContent).toBe("5")
    fireEvent.keyDown(input, { key: "Escape" })
    expect(screen.getByTestId("value").textContent).toBe("2")
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  for (const mode of ["disabled", "readOnly"]) {
    it(`blocks wheel, drag, keyboard and typing while ${mode}`, () => {
      render(<KnobConsumer disabled={mode === "disabled"} readOnly={mode === "readOnly"} />)
      const knob = screen.getByRole("slider", { name: "Gain knob" })
      knob.focus()
      fireEvent.wheel(knob, { deltaY: -40 })
      pointer(knob, "pointerdown", 100)
      pointer(document, "pointermove", 90)
      pointer(document, "pointerup", 90)
      fireEvent.keyDown(knob, { key: "End" })
      fireEvent.click(knob, { detail: 0 })
      fireEvent.keyDown(knob, { key: "5" })
      fireEvent.doubleClick(knob)
      expect(screen.getByTestId("value").textContent).toBe("2")
      expect(screen.queryByRole("textbox")).toBeNull()
    })
  }

  it("does not change existing numeric arrow/Home behavior or Enter pre-edit", () => {
    render(
      <DragPadNumber
        label="Existing numeric"
        value={2}
        onChange={() => {
          throw new Error("Unexpected numeric adjustment")
        }}
        min={0}
        max={10}
        step={1}
      />
    )
    const button = screen.getByRole("button", { name: "Existing numeric" })
    button.focus()
    fireEvent.keyDown(button, { key: "ArrowUp" })
    fireEvent.keyDown(button, { key: "Home" })
    fireEvent.click(button, { detail: 0 })
    fireEvent.keyDown(button, { key: "ArrowUp" })
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.keyDown(button, { key: "Enter" })
    expect(screen.getByRole("textbox", { name: "Existing numeric" })).toHaveProperty("value", "2")
  })
})
