import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import {
  configureProjectBackend,
  hydrateProject,
  projectActions,
  startProjectRuntime,
  useProjectEditGesture,
  useProjectState,
} from "."

function Control() {
  const gesture = useProjectEditGesture(projectActions.setBpm)
  return (
    <button
      type="button"
      onPointerDown={gesture.onGestureStart}
      onPointerMove={() => gesture.onChange(183)}
      onPointerUp={gesture.onGestureEnd}
      onPointerCancel={gesture.onGestureCancel}
    >
      BPM
    </button>
  )
}
let restore: (() => void) | undefined
let releaseRuntime: (() => void) | undefined
beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 2,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
  releaseRuntime = startProjectRuntime()
})
afterEach(() => {
  cleanup()
  releaseRuntime?.()
  releaseRuntime = undefined
  restore?.()
  restore = undefined
})

it("ignores the rest of a rejected drag instead of creating unowned commits", () => {
  let isRejectPreview = true
  restore = configureProjectBackend(() => {
    const backend = createMockProjectBackend()
    return {
      ...backend,
      apply(request) {
        if (request.stage === "preview" && isRejectPreview) {
          isRejectPreview = false
          return {
            kind: "rejected",
            sessionId: request.sessionId,
            sequence: request.sequence,
            controlGeneration: request.controlGeneration,
            code: "rejected",
          }
        }
        return backend.apply(request)
      },
    }
  })
  const control = render(<Control />).getByRole("button", { name: "BPM" })
  fireEvent.pointerDown(control)
  fireEvent.pointerMove(control)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  fireEvent.pointerMove(control)
  fireEvent.pointerCancel(control)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  fireEvent.pointerDown(control)
  fireEvent.pointerMove(control)
  fireEvent.pointerUp(control)
  expect(useProjectState.getState().document.transport.bpm).toBe(183)
  act(() => projectActions.undo())
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("edits and cancels while idle without acquiring an engine", () => {
  releaseRuntime?.()
  releaseRuntime = undefined
  const control = render(<Control />).getByRole("button", { name: "BPM" })
  fireEvent.pointerDown(control)
  fireEvent.pointerMove(control)
  expect(useProjectState.getState().document.transport.bpm).toBe(183)
  expect(useProjectState.getState().session.backend.phase).toBe("idle")
  fireEvent.pointerCancel(control)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})
