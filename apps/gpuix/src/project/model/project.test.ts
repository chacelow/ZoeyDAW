import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  hydrateProject,
  projectActions,
  serializeProject,
  setProjectStorageId,
  setSnapshotStorage,
  createMemorySnapshotStorage,
  startProjectRuntime,
  useProjectState,
} from "../adapters"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"
import { visibleTracks, positionToBar } from "./types"

let releaseRuntime: (() => void) | undefined
afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = undefined
  setSnapshotStorage(null)
})

beforeEach(() => {
  setSnapshotStorage(createMemorySnapshotStorage())
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

describe("project document and workspace commands", () => {
  it("groups edits into one undo entry and cancels abandoned edits", () => {
    projectActions.beginEdit()
    projectActions.setBpm(135)
    projectActions.setBpm(160)
    projectActions.updateTrack("trager", { name: "Percussion" })
    projectActions.endEdit()
    expect(useProjectState.getState().session.canUndo).toBe(true)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === "trager")?.name
    ).toBe("trager")
    expect(useProjectState.getState().session.canUndo).toBe(false)
    projectActions.redo()
    expect(useProjectState.getState().document.transport.bpm).toBe(160)
    projectActions.beginEdit()
    projectActions.setBpm(200)
    projectActions.cancelEdit()
    expect(useProjectState.getState().document.transport.bpm).toBe(160)
  })

  it("keeps a surviving clip editor open through undo and redo, but closes a removed clip", () => {
    projectActions.setEditingClip("trager-1")
    projectActions.updateClip("trager-1", {
      notes: [{ pitch: 72, startBeat: 0, lengthBeats: 1, velocity: 100 }],
    })
    projectActions.undo()
    expect(useProjectState.getState().session.editingClipId).toBe("trager-1")
    projectActions.redo()
    expect(useProjectState.getState().session.editingClipId).toBe("trager-1")
    projectActions.createClip("4-midi", "midi", 1, 1)
    const created = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
      .clips[0]
    projectActions.setEditingClip(created.id)
    projectActions.undo()
    expect(useProjectState.getState().session.editingClipId).toBeNull()
  })

  it("isolates copies, moves clips and folds only child lanes", () => {
    projectActions.duplicateClips(["trager-1"])
    const track = useProjectState.getState().document.tracks.find(item => item.id === "trager")!
    const copy = track.clips[1]
    expect(copy.id).not.toBe("trager-1")
    expect(useProjectState.getState().session.selectedClipIds).toEqual([copy.id])
    projectActions.updateClip(copy.id, {
      label: "Variant",
      notes: [{ id: "variant", pitch: 72, startBeat: 0, lengthBeats: 1, velocity: 110 }],
    })
    expect(
      useProjectState.getState().document.tracks.find(item => item.id === "trager")?.clips[0]
    ).not.toHaveProperty("label")
    projectActions.moveClips([copy.id], "4-midi", 2)
    expect(
      useProjectState.getState().document.tracks.find(item => item.id === "4-midi")?.clips[0]
        .startBar
    ).toBe(11)
    projectActions.updateTrack("drums-group", { collapsed: true })
    const shown = visibleTracks(useProjectState.getState().document.tracks).map(item => item.id)
    expect(shown).toContain("drums-group")
    expect(shown).not.toContain("trager")
    expect(shown).toContain("4-midi")
  })

  it("keeps group duplication, child routing and automation point edits independent", () => {
    projectActions.duplicateTracks(["drums-group"])
    const copies = useProjectState
      .getState()
      .document.tracks.filter(track => track.name.endsWith(" Copy"))
    const copiedGroup = copies.find(track => track.kind === "group")!
    expect(copiedGroup.childTrackIds).toHaveLength(2)
    expect(copiedGroup.childTrackIds).not.toContain("trager")
    expect(
      useProjectState
        .getState()
        .document.tracks.find(track => track.id === copiedGroup.childTrackIds?.[0])?.output
    ).toBe(copiedGroup.id)
    projectActions.setAutomationPoint("3-audio", "3-audio-volume", {
      id: "peak",
      bar: 10,
      value: 0.6,
    })
    expect(
      useProjectState
        .getState()
        .document.tracks.find(track => track.id === "3-audio")
        ?.automation[0].points.find(point => point.id === "peak")?.bar
    ).toBe(10)
    projectActions.undo()
    expect(
      useProjectState
        .getState()
        .document.tracks.find(track => track.id === "3-audio")
        ?.automation[0].points.find(point => point.id === "peak")?.bar
    ).toBe(9)
  })

  it("duplicates a complete group subtree after the original subtree", () => {
    projectActions.duplicateTracks(["drums-group", "trager"])
    const { tracks } = useProjectState.getState().document
    const index = tracks.findIndex(track => track.id === "drums-group")
    expect(tracks.slice(index, index + 6).map(track => track.name)).toEqual([
      "Drums",
      "trager",
      "sidechain",
      "Drums Copy",
      "trager Copy",
      "sidechain Copy",
    ])
    const copiedGroup = tracks[index + 3]
    expect(copiedGroup.childTrackIds).toEqual(
      tracks.slice(index + 4, index + 6).map(track => track.id)
    )
    expect(tracks.slice(index + 4, index + 6).map(track => track.output)).toEqual([
      copiedGroup.id,
      copiedGroup.id,
    ])
    projectActions.undo()
    expect(useProjectState.getState().document.tracks.map(track => track.name)).not.toContain(
      "Drums Copy"
    )
    projectActions.redo()
    expect(
      useProjectState
        .getState()
        .document.tracks.slice(index, index + 6)
        .map(track => track.name)
    ).toEqual(tracks.slice(index, index + 6).map(track => track.name))
  })

  it("duplicates nested branches once and updates the containing group's membership", () => {
    projectActions.addTrack("group", DEFAULT_LAYOUT_TOKENS.track.defaultHeight)
    const parent = useProjectState
      .getState()
      .document.tracks.find(track => track.kind === "group" && track.id !== "drums-group")!
    projectActions.updateTrack("drums-group", { output: parent.id })
    projectActions.reorderTrack("drums-group", "4-midi")
    projectActions.updateTrack("drums-group", { output: parent.id })
    projectActions.duplicateTracks(["drums-group", "sidechain"])
    const { tracks } = useProjectState.getState().document
    const index = tracks.findIndex(track => track.id === "drums-group")
    const copiedGroup = tracks[index + 3]
    expect(tracks.slice(index, index + 6).map(track => track.name)).toEqual([
      "Drums",
      "trager",
      "sidechain",
      "Drums Copy",
      "trager Copy",
      "sidechain Copy",
    ])
    expect(tracks.find(track => track.id === parent.id)?.childTrackIds).toEqual([
      "drums-group",
      copiedGroup.id,
    ])
    expect(copiedGroup.output).toBe(parent.id)
    expect(() => hydrateProject(serializeProject())).not.toThrow()
  })

  it("refuses routing cycles without changing document", () => {
    projectActions.addTrack("group", DEFAULT_LAYOUT_TOKENS.track.defaultHeight)
    const groupId = useProjectState
      .getState()
      .document.tracks.find(track => track.kind === "group" && track.id !== "drums-group")!.id
    projectActions.updateTrack("drums-group", { output: groupId })
    const before = serializeProject()
    projectActions.updateTrack(groupId, { output: "drums-group" })
    expect(serializeProject()).toBe(before)
    const cyclic = JSON.parse(before)
    cyclic.document.tracks.find((track: { id: string }) => track.id === groupId).output =
      "drums-group"
    expect(() => hydrateProject(JSON.stringify(cyclic))).toThrow()
  })

  it("rejects incompatible multi-origin destinations without changing tracks", () => {
    const before = serializeProject()
    projectActions.moveClips(["audio-1"], "4-midi", 2)
    projectActions.moveClips(["trager-1", "audio-1"], "4-midi", 2)
    projectActions.createClip("4-midi", "audio", 1, 4)
    expect(serializeProject()).toBe(before)
  })

  it("moves selected clips across lanes with relative offsets intact", () => {
    projectActions.createClip("sidechain", "midi", 5, 2)
    projectActions.addTrack("midi", DEFAULT_LAYOUT_TOKENS.track.defaultHeight)
    const destinationId = useProjectState
      .getState()
      .document.tracks.find(
        track => track.kind === "midi" && !["trager", "sidechain", "4-midi"].includes(track.id)
      )!.id
    const second = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "sidechain")!.clips[0].id
    projectActions.moveClips(["trager-1", second], "4-midi", 2, true)
    const firstDestination = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "4-midi")!
    const secondDestination = useProjectState
      .getState()
      .document.tracks.find(track => track.id === destinationId)!
    expect(firstDestination.clips.some(clip => clip.id !== second && clip.startBar === 3)).toBe(
      true
    )
    expect(secondDestination.clips.some(clip => clip.startBar === 7)).toBe(true)
    expect(useProjectState.getState().session.selectedClipIds).toHaveLength(2)
  })

  it("selects new copies without persisting selection", () => {
    projectActions.moveClips(["audio-1"], "3-audio", 2, true)
    const copiedId = useProjectState.getState().session.selectedClipIds[0]
    expect(copiedId).not.toBe("audio-1")
    expect(
      useProjectState
        .getState()
        .document.tracks.find(track => track.id === "3-audio")
        ?.clips.some(clip => clip.id === copiedId)
    ).toBe(true)
    expect(serializeProject()).not.toContain("selectedClipIds")
  })

  it("keeps audio split source windows aligned", () => {
    projectActions.splitClips(["audio-1"], 9)
    const audio = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!.clips
    expect(audio[1]).toMatchObject({ startBar: 9, lengthBars: 8, sourceOffsetBars: 8 })
  })

  it("tracks mock keyboard notes without sound and writes armed MIDI notes when recording", () => {
    releaseRuntime = startProjectRuntime()
    projectActions.noteOn(60)
    expect(useProjectState.getState().session.activeMidiNotes).toEqual([60])
    expect(serializeProject()).not.toContain("activeMidiNotes")
    projectActions.noteOff(60)
    projectActions.toggleRecording()
    projectActions.togglePlay()
    projectActions.noteOn(72)
    expect(
      structuredClone(
        useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
      )
    ).toMatchObject({
      kind: "midi",
      notes: expect.arrayContaining([expect.objectContaining({ pitch: 72 })]),
    })
    projectActions.noteOff(72)
    projectActions.stop()
    expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
  })

  it("uses one transport state for ruler position and editor controls", () => {
    projectActions.setNumerator(3)
    projectActions.setDenominator(8)
    projectActions.seekBar(2.5)
    const { position } = useProjectState.getState().session
    expect(positionToBar(position, 3)).toBe(2.5)
    projectActions.stop()
    expect(positionToBar(useProjectState.getState().session.position, 3)).toBe(2.5)
    projectActions.rewindToStart()
    expect(useProjectState.getState().session.position.bar).toBe(1)
  })
})

describe("versioned persistence", () => {
  it("persists only document/workspace, resets session and history upon load", () => {
    projectActions.setBpm(180)
    projectActions.togglePlay()
    projectActions.seekBar(25)
    projectActions.selectTracks(["trager"], "header")
    projectActions.setAutomationParameter("3-audio", "pan")
    const saved = serializeProject()
    expect(JSON.parse(saved)).toEqual(expect.objectContaining({ version: 2 }))
    expect(saved).not.toContain("selectedTrackIds")
    expect(saved).not.toContain("playing")
    expect(saved).not.toContain("waveformPeaks")
    expect(saved).not.toContain("automationParameters")
    hydrateProject(saved)
    const state = useProjectState.getState()
    expect(state.document.transport.bpm).toBe(180)
    expect(state.session.playing).toBe(false)
    expect(state.session.position.bar).toBe(1)
    expect(state.session.canUndo).toBe(false)
    expect(state.session.automationParameters).toEqual({})
  })

  it("rejects invalid snapshots without mutating project or undo history", () => {
    projectActions.setBpm(130)
    const before = serializeProject()
    const malformed = JSON.parse(before)
    malformed.document.tracks[0].clips = [{ id: "bad", kind: "audio", startBar: 1 }]
    expect(() => hydrateProject(JSON.stringify(malformed))).toThrow()
    expect(() => hydrateProject(JSON.stringify({ ...malformed, version: 99 }))).toThrow()
    malformed.document.tracks[0].clips = []
    malformed.document.tracks[0].kind = ["group"]
    expect(() => hydrateProject(JSON.stringify(malformed))).toThrow()
    malformed.document.tracks[0].kind = "group"
    malformed.document.transport.numerator = 3.5
    expect(() => hydrateProject(JSON.stringify(malformed))).toThrow()
    malformed.document.transport.numerator = 4
    malformed.document.transport.bpm = 0
    expect(() => hydrateProject(JSON.stringify(malformed))).toThrow()
    expect(serializeProject()).toBe(before)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  })

  it("scopes browser snapshots by project and leaves state untouched on missing restore", () => {
    setProjectStorageId("snapshot-test-a")
    releaseRuntime = startProjectRuntime()
    projectActions.setBpm(155)
    projectActions.saveSnapshot()
    expect(useProjectState.getState().session.dirty).toBe(false)
    projectActions.setBpm(175)
    expect(projectActions.restoreSnapshot()).toBe(true)
    expect(useProjectState.getState().document.transport.bpm).toBe(155)
    setProjectStorageId("snapshot-test-b")
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
    expect(projectActions.restoreSnapshot()).toBe(false)
    expect(useProjectState.getState().session.snapshotError).toBe("missing")
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  })
})
