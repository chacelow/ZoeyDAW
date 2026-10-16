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
  expect(useProjectState.getState().session.snapshotError).toBe("write")
  expect(projectActions.restoreSnapshot()).toBe(false)
  expect(useProjectState.getState().session.snapshotError).toBe("read")
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
  expect(useProjectState.getState().session.snapshotError).toBe("read")
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
  expect(useProjectState.getState().session.snapshotError).toBe("write")
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(155)
})

it("serializes and saves committed workspace preferences during a cancelled edit", () => {
  const before = useProjectState.getState().workspace.follow
  const token = projectActions.beginEdit("workspace-save")
  projectActions.setFollow(!before)
  const viewport = { pxPerBar: 80, scrollX: 240, scrollY: 70 }
  projectActions.setViewport(viewport)
  expect(JSON.parse(serializeProject()).workspace.follow).toBe(before)
  projectActions.saveSnapshot()
  projectActions.cancelEdit(token)
  expect(useProjectState.getState().workspace.follow).toBe(before)
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().workspace.follow).toBe(before)
  expect(useProjectState.getState().workspace).toMatchObject(viewport)
})

it.each(["loop", "clip", "marker", "automation"] as const)(
  "rejects a %s before bar one without replacing the current project",
  field => {
    const document = createMockDocument()
    if (field === "loop") {
      document.transport.loop = { enabled: true, startBar: 0.5, endBar: 3 }
    } else if (field === "clip") {
      document.tracks.find(track => track.id === "3-audio")!.clips[0].startBar = 0.5
    } else if (field === "marker") {
      document.markers[0].bar = 0.5
    } else {
      document.tracks.find(track => track.id === "3-audio")!.automation[0].points[0].bar = 0.5
    }
    const invalid = JSON.stringify({ version: 2, document, workspace: createMockWorkspace() })
    setSnapshotStorage({ get: () => invalid, set() {} })
    projectActions.setBpm(155)
    const before = serializeProject()
    expect(projectActions.restoreSnapshot()).toBe(false)
    expect(useProjectState.getState().session.snapshotError).toBe("invalid")
    expect(serializeProject()).toBe(before)
    expect(useProjectState.getState().session.canUndo).toBe(true)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  }
)

it("restores fractional positions after bar one and sub-bar durations", () => {
  const document = createMockDocument()
  document.transport.loop = { enabled: true, startBar: 1, endBar: 1.25 }
  const clip = document.tracks.find(track => track.id === "3-audio")!.clips[0]
  clip.startBar = 1.125
  clip.lengthBars = 0.25
  if (clip.kind === "audio") {
    clip.fadeInBars = 0
    clip.fadeOutBars = 0
    clip.fadeInOffsetBars = 0
    clip.fadeOutOffsetBars = 0
  }
  const saved = JSON.stringify({ version: 2, document, workspace: createMockWorkspace() })
  setSnapshotStorage({ get: () => saved, set() {} })
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().document.transport.loop).toEqual(document.transport.loop)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!.clips[0]
  ).toMatchObject({ startBar: 1.125, lengthBars: 0.25 })
})
