import { afterEach, beforeEach, expect, it } from "bun:test"
import {
  createMemorySnapshotStorage,
  hydrateProject,
  projectActions,
  serializeProject,
  setSnapshotStorage,
  startProjectRuntime,
  useProjectState,
} from "."
import { createMockDocument, createMockWorkspace } from "./fixtures"

let releaseRuntime: (() => void) | undefined

beforeEach(() => {
  setSnapshotStorage(createMemorySnapshotStorage())
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  releaseRuntime = startProjectRuntime()
})

afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = undefined
  setSnapshotStorage(null)
})

it("keeps unsaved edits and reports unavailable storage until a port is installed", () => {
  setSnapshotStorage(null)
  projectActions.setBpm(155)
  const before = serializeProject()
  projectActions.saveSnapshot()
  expect(useProjectState.getState().session.dirty).toBe(true)
  expect(useProjectState.getState().session.snapshotError).toMatch(/Could not save/)
  expect(projectActions.restoreSnapshot()).toBe(false)
  expect(useProjectState.getState().session.snapshotError).toMatch(/Could not read/)
  expect(serializeProject()).toBe(before)

  setSnapshotStorage(createMemorySnapshotStorage())
  projectActions.saveSnapshot()
  expect(useProjectState.getState().session.dirty).toBe(false)
  expect(useProjectState.getState().session.snapshotError).toBeNull()
  projectActions.setBpm(175)
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(155)
})

it("preserves project edits when the storage port cannot read", () => {
  const storage = createMemorySnapshotStorage()
  setSnapshotStorage({
    ...storage,
    get() {
      throw new Error("Read denied")
    },
  })
  projectActions.setBpm(155)
  const before = serializeProject()
  expect(projectActions.restoreSnapshot()).toBe(false)
  expect(useProjectState.getState().session.snapshotError).toMatch(/Could not read/)
  expect(serializeProject()).toBe(before)
  expect(useProjectState.getState().session.dirty).toBe(true)
})

it("keeps the previous saved revision and dirty edits when a write fails", () => {
  const storage = createMemorySnapshotStorage()
  setSnapshotStorage(storage)
  projectActions.setBpm(155)
  projectActions.saveSnapshot()
  projectActions.setBpm(175)
  setSnapshotStorage({
    ...storage,
    set() {
      throw new Error("Write denied")
    },
  })
  projectActions.saveSnapshot()
  expect(useProjectState.getState().session.dirty).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(175)
  expect(useProjectState.getState().session.snapshotError).toMatch(/Could not save/)
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(155)
})
