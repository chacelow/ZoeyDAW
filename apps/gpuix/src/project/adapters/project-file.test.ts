import { afterEach, beforeEach, expect, it } from "bun:test"
import {
  createMemoryProjectFiles,
  hydrateProject,
  openNewProject,
  openProjectFile,
  projectActions,
  serializeProject,
  setProjectFiles,
  startProjectRuntime,
  useProjectState,
} from "."
import { createMockDocument, createMockWorkspace } from "./fixtures"

const path = "/projects/Song Project/Song.zdaw"
let files = createMemoryProjectFiles()
let releaseRuntime: (() => void) | undefined

beforeEach(() => {
  files = createMemoryProjectFiles()
  setProjectFiles(files)
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  releaseRuntime = startProjectRuntime()
})

afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = undefined
  setProjectFiles(createMemoryProjectFiles())
})

it("asks for a location the first time, then saves to the same file", () => {
  projectActions.setBpm(155)
  const request = useProjectState.getState().session.saveAsRequest
  projectActions.save()
  expect(useProjectState.getState().session.saveAsRequest).toBe(request + 1)
  expect(files.entries.size).toBe(0)
  projectActions.saveAs(path)
  expect(useProjectState.getState().session).toMatchObject({ dirty: false, filePath: path })
  projectActions.setBpm(160)
  projectActions.save()
  expect(useProjectState.getState().session.saveAsRequest).toBe(request + 1)
  expect(JSON.parse(files.entries.get(path) ?? "{}").document.transport.bpm).toBe(160)
})

it("saves and reopens dock workspace JSON through the project-file adapter", () => {
  const dockLayout = JSON.stringify({
    version: 1,
    root: { kind: "group", id: "editors", tabs: ["arrangement", "clipEditor"], active: "clipEditor" },
    hidden: ["browser", "devices"], activeGroup: "editors", maximizedGroup: "editors",
  })
  projectActions.setDockLayout(dockLayout)
  expect(useProjectState.getState().session.dirty).toBe(false)
  projectActions.saveAs(path)
  expect(useProjectState.getState().session.dirty).toBe(false)
  openNewProject("other-workspace")
  expect(useProjectState.getState().workspace.dockLayout).toBeNull()
  expect(openProjectFile(path)).toBe(true)
  expect(useProjectState.getState().workspace.dockLayout).toBe(dockLayout)
})

it("keeps current dock geometry when saving, cancelling and undoing authored edits", () => {
  const edit = projectActions.beginEdit("dock-workspace-save")
  projectActions.setBpm(145)
  projectActions.setDockLayout("workspace-during-edit")
  expect(JSON.parse(serializeProject()).workspace.dockLayout).toBe("workspace-during-edit")
  projectActions.cancelEdit(edit)
  expect(useProjectState.getState().workspace.dockLayout).toBe("workspace-during-edit")
  projectActions.setBpm(150)
  projectActions.setDockLayout("workspace-after-edit")
  projectActions.undo()
  expect(useProjectState.getState().workspace.dockLayout).toBe("workspace-after-edit")
})

it("reopens a saved file and keeps edits when the write fails", () => {
  projectActions.setBpm(155)
  projectActions.saveAs(path)
  openNewProject("other")
  expect(openProjectFile(path)).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(155)
  setProjectFiles({
    read: () => null,
    write() {
      throw new Error("Write denied")
    },
  })
  projectActions.setBpm(175)
  projectActions.save()
  expect(useProjectState.getState().session).toMatchObject({ dirty: true, fileError: "write" })
  expect(JSON.parse(files.entries.get(path) ?? "{}").document.transport.bpm).toBe(155)
})

it("blocks saving over a damaged file until Save As chooses a new location", () => {
  const damaged = '{"version":2,"document":"damaged"}'
  files.entries.set(path, damaged)
  expect(openProjectFile(path)).toBe(false)
  expect(useProjectState.getState().session).toMatchObject({
    fileError: "invalid",
    saveBlocked: true,
  })
  projectActions.save()
  expect(files.entries.get(path)).toBe(damaged)
  const copy = "/projects/Copy Project/Copy.zdaw"
  projectActions.saveAs(copy)
  expect(files.entries.has(copy)).toBe(true)
  expect(useProjectState.getState().session).toMatchObject({
    filePath: copy,
    fileError: null,
    saveBlocked: false,
  })
})

it("reports a missing file without blocking a fresh save", () => {
  expect(openProjectFile(path)).toBe(false)
  expect(useProjectState.getState().session).toMatchObject({
    fileError: "missing",
    saveBlocked: false,
  })
  projectActions.save()
  expect(files.entries.has(path)).toBe(true)
})

it("saves committed workspace preferences during a cancelled edit", () => {
  const before = useProjectState.getState().workspace.follow
  const token = projectActions.beginEdit("workspace-save")
  projectActions.setFollow(!before)
  expect(JSON.parse(serializeProject()).workspace.follow).toBe(before)
  projectActions.saveAs(path)
  projectActions.cancelEdit(token)
  expect(JSON.parse(files.entries.get(path) ?? "{}").workspace.follow).toBe(before)
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
    expect(() =>
      hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
    ).toThrow()
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
  files.entries.set(
    path,
    JSON.stringify({ version: 2, document, workspace: createMockWorkspace() })
  )
  expect(openProjectFile(path)).toBe(true)
  expect(useProjectState.getState().document.transport.loop).toEqual(document.transport.loop)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!.clips[0]
  ).toMatchObject({ startBar: 1.125, lengthBars: 0.25 })
})
