import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
import { parseProject } from "@zoeydaw/project-core/persistence"
import {
  createMockProjectBackend,
  createMockDocument,
  createMockWorkspace,
} from "@zoeydaw/project-runtime/testing"
import { captureProjectSave, waitForProjectSave, completeProjectSave } from "./context"
import {
  configureProjectBackend,
  hydrateProject,
  projectActions,
  serializeProject,
  useProjectState,
  startProjectRuntime,
} from "."

import { deferredBackend } from "./runtime-test-backend"

const fresh = () =>
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
let restore: (() => void) | null = null
let releaseRuntime: (() => void) | null = null
beforeEach(() => {
  configureProjectBackend(createMockProjectBackend)
  localStorage.clear()
  fresh()
  releaseRuntime = startProjectRuntime()
})
afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = null
  restore?.()
  restore = null
})

it("does not clear dirty until accepted, and fences delayed save and old project responses", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(155)
  const saving = waitForProjectSave(captureProjectSave(), new AbortController().signal)
  const rejected = expect(saving).rejects.toThrow(/changed/)
  expect(useProjectState.getState().session.dirty).toBe(true)
  const old = remote.pending[0]
  fresh()
  old.resolve({
    kind: "rejected",
    sessionId: old.request.sessionId,
    sequence: old.request.sequence,
    controlGeneration: old.request.controlGeneration,
    code: "rejected",
  })
  await Promise.resolve()
  await rejected
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.backend.error).toBeNull()
  expect(useProjectState.getState().session.dirty).toBe(false)
})

it("accepts a captured revision after later acknowledgements without clearing newer edits", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(145)
  const capture = captureProjectSave()
  projectActions.setBpm(165)
  remote.settle("accepted")
  await Promise.resolve()
  remote.settle("accepted")
  await Promise.resolve()
  await waitForProjectSave(capture, new AbortController().signal)
  completeProjectSave(capture)
  expect(capture.document.transport.bpm).toBe(145)
  expect(useProjectState.getState().document.transport.bpm).toBe(165)
  expect(useProjectState.getState().session.dirty).toBe(true)
})

it("does not cancel a pending save just because the unhistoried viewport changed", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(147)
  const capture = captureProjectSave()
  const saved = waitForProjectSave(capture, new AbortController().signal)
  projectActions.setViewport({ scrollX: 192 })
  remote.settle("accepted")
  await saved
  completeProjectSave(capture)
  expect(useProjectState.getState().session.dirty).toBe(false)
  expect(useProjectState.getState().workspace.scrollX).toBe(192)
})

it("captures committed values rather than temporary numeric and workspace edits", async () => {
  projectActions.beginEdit()
  projectActions.setBpm(170)
  projectActions.setFollow(false)
  const capture = captureProjectSave()
  expect(parseProject(serializeProject()).document.transport.bpm).toBe(120)
  expect(capture.document.transport.bpm).toBe(120)
  expect(capture.workspace.follow).toBe(true)
  await waitForProjectSave(capture, new AbortController().signal)
  completeProjectSave(capture)
  projectActions.cancelEdit()
  expect(useProjectState.getState().session.dirty).toBe(false)
})

it("does not clear dirty before the captured revision is accepted or after cancellation", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(151)
  const capture = captureProjectSave()
  const abort = new AbortController()
  const saved = waitForProjectSave(capture, abort.signal)
  const cancelled = expect(saved).rejects.toMatchObject({ name: "AbortError" })
  abort.abort()
  await cancelled
  expect(useProjectState.getState().session.dirty).toBe(true)
  remote.settle("accepted")
  await Promise.resolve()
  expect(useProjectState.getState().session.dirty).toBe(true)
})
