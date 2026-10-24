import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { effectiveDrawMode } from "@zoeydaw/project-core/interaction-mode"
import { drawModeKeyDown, markDrawModeGesture, useDrawModeKeyRelease } from "./drawModeKey"

function Keys() {
  useDrawModeKeyRelease()
  return null
}

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: { ...createMockWorkspace(), drawMode: false, computerKeyboard: false },
    })
  )
})
afterEach(cleanup)

it("latches a tapped B as one undoable preference change", () => {
  render(<Keys />)
  expect(drawModeKeyDown(new KeyboardEvent("keydown", { key: "b" }))).toBe(true)
  expect(effectiveDrawMode(useProjectState.getState())).toBe(true)
  expect(useProjectState.getState().workspace.drawMode).toBe(false)
  fireEvent.keyUp(window, { key: "b" })
  expect(useProjectState.getState().workspace.drawMode).toBe(true)
  expect(useProjectState.getState().session.drawModeOverride).toBeNull()
  projectActions.undo()
  expect(useProjectState.getState().workspace.drawMode).toBe(false)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("does not record held B in the gesture snapshot or add tool-mode undo entries", () => {
  render(<Keys />)
  drawModeKeyDown(new KeyboardEvent("keydown", { key: "b" }))
  markDrawModeGesture()
  projectActions.beginEdit()
  projectActions.setBpm(130)
  projectActions.endEdit()
  fireEvent.keyUp(window, { key: "b" })
  expect(effectiveDrawMode(useProjectState.getState())).toBe(false)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().workspace.drawMode).toBe(false)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("cancels a pending override on blur and leaves MIDI keyboard B untouched", () => {
  render(<Keys />)
  drawModeKeyDown(new KeyboardEvent("keydown", { key: "b" }))
  fireEvent(window, new Event("blur"))
  expect(effectiveDrawMode(useProjectState.getState())).toBe(false)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  projectActions.setMode("computerKeyboard", true)
  expect(drawModeKeyDown(new KeyboardEvent("keydown", { key: "b" }))).toBe(false)
  expect(useProjectState.getState().session.drawModeOverride).toBeNull()
})
