import { afterEach, beforeEach, expect, it } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { createMockDocument, createMockWorkspace } from "./fixtures"
import { createMockProjectBackend } from "./backend/mock"
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
    <div
      testId="bpm"
      style={{ width: 120, height: 40 }}
      onMouseDown={gesture.onGestureStart}
      onMouseMove={() => gesture.onChange(183)}
      onMouseUp={gesture.onGestureEnd}
      onKeyDown={event => {
        if (event.key === "escape") gesture.onGestureCancel()
      }}
    >
      <text>BPM</text>
    </div>
  )
}
let restore: (() => void) | undefined
let releaseRuntime: (() => void) | undefined
let testRoot: TestRoot | undefined

function mountControl() {
  const root = createTestRoot({ width: 320, height: 160 })
  testRoot = root
  root.render(<Control />)
  const control = root.renderer.findByTestId("bpm")
  if (!control) throw new Error("BPM control was not mounted")
  const bounds = root.renderer.getElementBounds(control.id)
  if (!bounds) throw new Error("BPM control has no bounds")
  return { renderer: root.renderer, id: control.id, x: bounds.x + 20, y: bounds.y + 20 }
}
beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  releaseRuntime = startProjectRuntime()
})
afterEach(() => {
  testRoot?.unmount()
  testRoot = undefined
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
            code: "rejected",
          }
        }
        return backend.apply(request)
      },
    }
  })
  const { renderer, id, x, y } = mountControl()
  renderer.nativeSimulateMouseDown(x, y)
  renderer.nativeSimulateMouseMove(x + 1, y, 0)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  renderer.nativeSimulateMouseMove(x + 2, y, 0)
  renderer.nativeSimulateKeyDown(id, "escape")
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  renderer.nativeSimulateMouseDown(x, y)
  renderer.nativeSimulateMouseMove(x + 1, y, 0)
  renderer.nativeSimulateMouseUp(x + 1, y)
  expect(useProjectState.getState().document.transport.bpm).toBe(183)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("edits and cancels while idle without acquiring an engine", () => {
  releaseRuntime?.()
  releaseRuntime = undefined
  const { renderer, id, x, y } = mountControl()
  renderer.nativeSimulateMouseDown(x, y)
  renderer.nativeSimulateMouseMove(x + 1, y, 0)
  expect(useProjectState.getState().document.transport.bpm).toBe(183)
  expect(useProjectState.getState().session.backend.phase).toBe("idle")
  renderer.nativeSimulateKeyDown(id, "escape")
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})
