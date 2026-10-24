import { beforeEach, describe, expect, it } from "vitest"
import { hydrateProject, projectActions, serializeProject, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { initialDocument, initialWorkspace } from "@zoeydaw/project-runtime/state"
import { DEFAULT_TRACK_HEIGHT } from "../layout"
import { parseProject, stringifyProject } from "@zoeydaw/project-core/persistence"
import { createTrack, reduceDocument } from "@zoeydaw/project-core/reducers"
import type { DocumentState } from "@zoeydaw/project-core/types"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
})

const invalidDocuments: { name: string; mutate: (document: DocumentState) => void }[] = [
  {
    name: "a second main output",
    mutate(document) {
      const main = document.tracks.find(track => track.id === "main")!
      document.tracks.push({ ...structuredClone(main), id: "other-main" })
    },
  },
  {
    name: "an audio clip on a MIDI track",
    mutate(document) {
      const clip = document.tracks.find(track => track.id === "3-audio")!.clips[0]
      document.tracks.find(track => track.id === "4-midi")!.clips = [
        { ...structuredClone(clip), id: "cross-kind" },
      ]
    },
  },
  {
    name: "a clip owned by a group bus",
    mutate(document) {
      const clip = document.tracks.find(track => track.id === "trager")!.clips[0]
      document.tracks.find(track => track.id === "drums-group")!.clips = [
        { ...structuredClone(clip), id: "bus-clip" },
      ]
    },
  },
]

describe("project topology construction", () => {
  it.each(invalidDocuments)("rejects $name without changing the active project", ({ mutate }) => {
    projectActions.setBpm(130)
    const before = serializeProject()
    const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
    mutate(document)
    expect(() =>
      hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
    ).toThrow()
    expect(serializeProject()).toBe(before)
  })
})

describe("minimum ordinary track", () => {
  const ordinary = (document: DocumentState) =>
    document.tracks.filter(track => track.kind === "audio" || track.kind === "midi")
  const load = (document: DocumentState) =>
    hydrateProject(JSON.stringify({ version: 3, document, workspace: initialWorkspace() }))

  it("starts with one empty audio track using standard defaults and Main routing", () => {
    const document = initialDocument(DEFAULT_TRACK_HEIGHT)
    expect(document.tracks.map(track => track.kind)).toEqual(["audio", "main"])
    const track = ordinary(document)[0]
    expect(track).toMatchObject({ kind: "audio", output: "main", clips: [], automation: [] })
    expect(document.media).toEqual([])
    expect(document.markers).toEqual([])
  })

  it.each(["audio", "midi"] as const)("atomically refuses deleting the last %s track", kind => {
    const document = initialDocument(DEFAULT_TRACK_HEIGHT)
    const track = createTrack(kind, [], undefined, DEFAULT_TRACK_HEIGHT)
    const group = createTrack("group", [], undefined, DEFAULT_TRACK_HEIGHT)
    const send = createTrack("return", [], undefined, DEFAULT_TRACK_HEIGHT)
    document.tracks = [track, group, send, ...document.tracks.filter(item => item.kind === "main")]
    load(document)
    expect(ordinary(useProjectState.getState().document).map(item => item.kind)).toEqual([kind])
    projectActions.selectTracks([track.id], "header")
    const before = useProjectState.getState()
    projectActions.deleteTracks([track.id])
    expect(useProjectState.getState()).toBe(before)
    projectActions.deleteTracks([track.id, group.id, send.id, "main"])
    expect(useProjectState.getState()).toBe(before)
    expect(before.session.canUndo).toBe(false)
  })

  it("rejects all-track multiselection without dropping clips, selection or redo", () => {
    projectActions.setBpm(150)
    projectActions.undo()
    const before = useProjectState.getState()
    projectActions.deleteTracks(before.document.tracks.map(track => track.id))
    expect(useProjectState.getState()).toBe(before)
    expect(before.session.canRedo).toBe(true)
    projectActions.redo()
    expect(useProjectState.getState().document.transport.bpm).toBe(150)
  })

  it("rejects recursive nested-group deletion when it contains every ordinary track", () => {
    load(initialDocument(DEFAULT_TRACK_HEIGHT))
    const track = ordinary(useProjectState.getState().document)[0]
    projectActions.groupTracks([track.id])
    const inner = useProjectState.getState().document.tracks.find(item => item.kind === "group")!
    projectActions.groupTracks([inner.id])
    const before = useProjectState.getState()
    const outer = before.document.tracks.find(
      item => item.kind === "group" && item.id !== inner.id
    )!
    projectActions.deleteTracks([outer.id, track.id])
    expect(useProjectState.getState()).toBe(before)
    projectActions.undo()
    expect(ordinary(useProjectState.getState().document)).toHaveLength(1)
    expect(
      useProjectState.getState().document.tracks.filter(item => item.kind === "group")
    ).toHaveLength(1)
    projectActions.redo()
    expect(useProjectState.getState().document).toEqual(before.document)
  })

  it("allows a group subtree deletion when a MIDI track survives, including undo/redo", () => {
    load(initialDocument(DEFAULT_TRACK_HEIGHT))
    const audio = ordinary(useProjectState.getState().document)[0]
    projectActions.groupTracks([audio.id])
    projectActions.addTrack("midi")
    const before = useProjectState.getState().document
    const group = before.tracks.find(item => item.kind === "group")!
    const midi = before.tracks.find(item => item.kind === "midi")!
    projectActions.deleteTracks([group.id])
    const deleted = useProjectState.getState().document
    expect(deleted.tracks.map(item => item.id)).toEqual([midi.id, "main"])
    projectActions.deleteTracks([midi.id])
    expect(useProjectState.getState().document).toBe(deleted)
    projectActions.undo()
    expect(useProjectState.getState().document).toEqual(before)
    projectActions.redo()
    expect(useProjectState.getState().document).toEqual(deleted)
    expect(ordinary(useProjectState.getState().document)).toHaveLength(1)
  })

  it("refuses a raw track replacement that would remove all ordinary tracks", () => {
    const document = initialDocument(DEFAULT_TRACK_HEIGHT)
    expect(
      reduceDocument(document, {
        type: "tracks",
        tracks: document.tracks.filter(track => track.kind === "main"),
      })
    ).toBe(document)
  })

  it.each([1, 2, 3])(
    "normalizes a valid version-%s bus-only snapshot without losing data",
    version => {
      const document = initialDocument(DEFAULT_TRACK_HEIGHT)
      const send = createTrack("return", [], undefined, DEFAULT_TRACK_HEIGHT)
      const group = createTrack("group", [], undefined, DEFAULT_TRACK_HEIGHT)
      document.tracks = [group, send, ...document.tracks.filter(track => track.kind === "main")]
      document.name = "Authored legacy project"
      document.transport.bpm = 137
      document.media = createMockDocument(DEFAULT_TRACK_HEIGHT).media
      document.markers = [{ id: "authored-marker", bar: 7, label: "Verse" }]
      document.tracks.find(track => track.id === "main")!.volumeDb = -12
      const workspace = { ...initialWorkspace(), scrollX: 123, gridBars: 0.25 }
      const raw = JSON.stringify({ version, document, workspace })
      const parsed = parseProject(raw)
      expect(parsed.document).toEqual(document)
      expect(parsed.workspace.scrollX).toBe(123)
      hydrateProject(raw)
      const hydrated = useProjectState.getState().document
      const added = ordinary(hydrated)
      expect(added).toHaveLength(1)
      expect(added[0]).toMatchObject({ kind: "audio", output: "main", clips: [], automation: [] })
      expect(hydrated.tracks.filter(track => track.id !== added[0].id)).toEqual(document.tracks)
      expect({ ...hydrated, tracks: document.tracks }).toEqual(document)
      expect(ordinary(parseProject(stringifyProject(hydrated, parsed.workspace)).document)).toEqual(
        added
      )
      expect(useProjectState.getState().session.canUndo).toBe(false)
      projectActions.setBpm(160)
      projectActions.undo()
      expect(useProjectState.getState().document).toEqual(hydrated)
      projectActions.redo()
      expect(ordinary(useProjectState.getState().document)).toHaveLength(1)
    }
  )
})
