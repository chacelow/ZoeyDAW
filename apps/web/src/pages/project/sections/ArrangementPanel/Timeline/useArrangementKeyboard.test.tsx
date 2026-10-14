// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { Button } from "@zoeymind/ui"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { useArrangementKeyboard } from "./useArrangementKeyboard"

function Keys({ role = "button" }: { readonly role?: "button" | "menuitem" }) {
  useArrangementKeyboard()
  const automation = useProjectState(state => state.workspace.automationMode)
  return (
    <>
      <Button
        role={role}
        aria-label="Automation"
        aria-pressed={automation}
        onClick={() => projectActions.setMode("automationMode", !automation)}
      >
        Automation
      </Button>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Level"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={5}
      />
      <input aria-label="Search" />
      <textarea aria-label="Notes" />
      <div contentEditable role="textbox" aria-label="Rename" suppressContentEditableWarning />
    </>
  )
}

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 2,
      document: createMockDocument(),
      workspace: {
        ...createMockWorkspace(),
        automationMode: false,
      },
    })
  )
})
afterEach(cleanup)

it.each(["button", "menuitem"] as const)(
  "owns Space over a focused %s without activating it or repeating playback",
  role => {
    const view = render(<Keys role={role} />)
    const button = view.getByLabelText("Automation")
    button.focus()
    expect(fireEvent.keyDown(button, { key: " ", code: "Space" })).toBe(false)
    expect(document.activeElement).not.toBe(button)
    expect(useProjectState.getState().session.playing).toBe(true)
    fireEvent.keyDown(button, { key: " ", code: "Space", repeat: true })
    expect(useProjectState.getState().session.playing).toBe(true)
    expect(fireEvent.keyUp(button, { key: " ", code: "Space" })).toBe(false)
    expect(useProjectState.getState().workspace.automationMode).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(document.activeElement).not.toBe(button)
    fireEvent.keyDown(button, { key: " ", code: "Space" })
    expect(useProjectState.getState().session.playing).toBe(false)
  }
)

it("releases a focused slider without adjusting its value", () => {
  const slider = render(<Keys />).getByRole("slider")
  slider.focus()
  expect(fireEvent.keyDown(slider, { key: " ", code: "Space" })).toBe(false)
  expect(document.activeElement).not.toBe(slider)
  expect(slider.getAttribute("aria-valuenow")).toBe("5")
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(fireEvent.keyUp(slider, { key: " ", code: "Space" })).toBe(false)
  expect(slider.getAttribute("aria-valuenow")).toBe("5")
  expect(useProjectState.getState().session.playing).toBe(true)
})

it.each(["Search", "Notes", "Rename"])("leaves Space available to the %s editor", label => {
  const editor = render(<Keys />).getByLabelText(label)
  editor.focus()
  expect(fireEvent.keyDown(editor, { key: " ", code: "Space" })).toBe(true)
  expect(fireEvent.keyUp(editor, { key: " ", code: "Space" })).toBe(true)
  expect(useProjectState.getState().session.playing).toBe(false)
})

it("leaves Enter and modified Space to their existing owners", () => {
  const button = render(<Keys />).getByLabelText("Automation")
  button.focus()
  expect(fireEvent.keyDown(button, { key: "Enter", code: "Enter" })).toBe(true)
  expect(fireEvent.keyDown(button, { key: " ", code: "Space", ctrlKey: true })).toBe(true)
  expect(document.activeElement).toBe(button)
  expect(useProjectState.getState().session.playing).toBe(false)
})
