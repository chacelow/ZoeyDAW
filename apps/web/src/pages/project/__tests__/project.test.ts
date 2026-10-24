import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  hydrateProject,
  projectActions,
  serializeProject,
  startProjectRuntime,
  useProjectState,
} from "../adapters"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { visibleTracks, positionToBar } from "@zoeydaw/project-core/types"
import { configureProjectBackend } from "../adapters/context"

let releaseRuntime: (() => void) | undefined
afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = undefined
})

beforeEach(() => {
  configureProjectBackend(createMockProjectBackend)
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
})
it("persists view switches without editing the document and defaults older snapshots to visible", () => {
  const document = useProjectState.getState().document
  const selected = ["3-audio"]
  projectActions.selectTracks(selected, "header")
  projectActions.setArrangementView("routing", false)
  projectActions.setArrangementView("returns", false)
  projectActions.setArrangementView("overview", false)
  expect(useProjectState.getState().document).toBe(document)
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(selected)
  expect(useProjectState.getState().session.canUndo).toBe(true)
  const saved = JSON.parse(serializeProject())
  expect(saved.workspace.arrangementView).toEqual({
    routing: false,
    returns: false,
    overview: false,
  })
  projectActions.undo()
  expect(useProjectState.getState().workspace.arrangementView.overview).toBe(true)
  expect(useProjectState.getState().document).toBe(document)
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(selected)
  projectActions.redo()
  expect(useProjectState.getState().workspace.arrangementView.overview).toBe(false)
  expect(useProjectState.getState().document).toBe(document)
  const invalid = structuredClone(saved)
  invalid.workspace.arrangementView.returns = "false"
  expect(() => hydrateProject(JSON.stringify(invalid))).toThrow()
  invalid.workspace.arrangementView.returns = false
  delete invalid.workspace.arrangementView.overview
  expect(() => hydrateProject(JSON.stringify(invalid))).toThrow()
  invalid.workspace.arrangementView = null
  expect(() => hydrateProject(JSON.stringify(invalid))).toThrow()
  hydrateProject(JSON.stringify(saved))
  expect(useProjectState.getState().workspace.arrangementView).toEqual({
    routing: false,
    returns: false,
    overview: false,
  })
  expect(useProjectState.getState().document.tracks.map(track => track.id)).toEqual(
    document.tracks.map(track => track.id)
  )
  delete saved.workspace.arrangementView
  hydrateProject(JSON.stringify(saved))
  expect(useProjectState.getState().workspace.arrangementView).toEqual({
    routing: true,
    returns: true,
    overview: true,
  })
})

it("persists the time-ruler format and rejects unknown values", () => {
  projectActions.setRulerFormat("25")
  const saved = JSON.parse(serializeProject())
  expect(saved.workspace.rulerFormat).toBe("25")
  projectActions.undo()
  expect(useProjectState.getState().workspace.rulerFormat).toBe("time")
  hydrateProject(JSON.stringify(saved))
  expect(useProjectState.getState().workspace.rulerFormat).toBe("25")
  const invalid = structuredClone(saved)
  invalid.workspace.rulerFormat = "50"
  expect(() => hydrateProject(JSON.stringify(invalid))).toThrow()
  delete invalid.workspace.rulerFormat
  hydrateProject(JSON.stringify(invalid))
  expect(useProjectState.getState().workspace.rulerFormat).toBe("time")
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

  it("duplicates devices with independent identities and linked automation targets", () => {
    const source = useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!
    const device = {
      id: "duplicated-filter",
      kind: "filter",
      enabled: true,
      collapsed: false,
      frequency: 1200,
      resonance: 0.25,
    } as const
    projectActions.updateTrack(source.id, {
      devices: [device],
      automation: [
        ...source.automation,
        {
          id: "device-frequency",
          target: { kind: "device", deviceId: device.id, parameter: "frequency" },
          points: [{ id: "frequency-one", bar: 4, value: 0.4 }],
        },
      ],
    })
    projectActions.duplicateTracks([source.id])
    const original = useProjectState
      .getState()
      .document.tracks.find(track => track.id === source.id)!
    const copied = useProjectState
      .getState()
      .document.tracks.find(track => track.name === `${source.name} Copy`)!
    const clonedDevice = copied.devices![0]
    expect(clonedDevice.id).not.toBe(device.id)
    expect(copied.automation.find(lane => lane.target.kind === "device")?.target).toEqual({
      kind: "device",
      deviceId: clonedDevice.id,
      parameter: "frequency",
    })
    expect(original.devices![0].id).toBe(device.id)
    expect(copied.automation.find(lane => lane.target.kind === "device")?.points).toEqual([
      { id: expect.not.stringMatching(/^frequency-one$/), bar: 4, value: 0.4 },
    ])
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

  it("refuses routing cycles without changing document", () => {
    projectActions.addTrack("group")
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
    projectActions.addTrack("midi")
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

  it("starts playback with recording and stops recording without stopping playback", () => {
    releaseRuntime = startProjectRuntime()
    projectActions.toggleRecording()
    expect(useProjectState.getState().session).toMatchObject({ playing: true, recording: true })
    projectActions.toggleRecording()
    expect(useProjectState.getState().session).toMatchObject({ playing: true, recording: false })
    projectActions.toggleRecording()
    projectActions.togglePlay()
    expect(useProjectState.getState().session).toMatchObject({ playing: false, recording: false })
    projectActions.toggleRecording()
    projectActions.stop()
    expect(useProjectState.getState().session).toMatchObject({ playing: false, recording: false })
  })

  it("tracks mock keyboard notes without sound and writes armed MIDI notes when recording", () => {
    releaseRuntime = startProjectRuntime()
    projectActions.noteOn(60)
    expect(useProjectState.getState().session.activeMidiNotes).toEqual([60])
    expect(serializeProject()).not.toContain("activeMidiNotes")
    projectActions.noteOff(60)
    projectActions.toggleRecording()
    projectActions.noteOn(72)
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
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
    projectActions.setAutomationTarget("3-audio", { kind: "mixer", parameter: "pan" })
    const saved = serializeProject()
    expect(saved).not.toContain("selectedTrackIds")
    expect(saved).not.toContain("playing")
    expect(saved).not.toContain("waveformPeaks")
    expect(saved).not.toContain("automationTargets")
    hydrateProject(saved)
    const state = useProjectState.getState()
    expect(state.document.transport.bpm).toBe(180)
    expect(state.session.playing).toBe(false)
    expect(state.session.position.bar).toBe(1)
    expect(state.session.canUndo).toBe(false)
    expect(state.session.automationTargets).toEqual({})
    const restoredAudio = state.document.tracks
      .find(track => track.id === "3-audio")
      ?.clips.find(clip => clip.id === "audio-1")
    expect(restoredAudio?.kind === "audio" && restoredAudio.waveformPeaks?.length).toBe(64)
  })

  it("persists visible lanes separately from authored points and rejects unknown targets", () => {
    const volume = { kind: "mixer", parameter: "volume" } as const
    const pan = { kind: "mixer", parameter: "pan" } as const
    projectActions.addAutomationLane("3-audio")
    projectActions.setAutomationTarget("3-audio", pan)
    projectActions.addAutomationLane("3-audio")
    let state = useProjectState.getState()
    expect(state.workspace.automationLanes["3-audio"]).toEqual([volume, pan])
    expect(state.document.tracks.find(track => track.id === "3-audio")?.automation).toHaveLength(2)
    projectActions.setMode("automationMode", true)
    projectActions.updateTrack("3-audio", { collapsed: true })
    const saved = serializeProject()
    hydrateProject(saved)
    state = useProjectState.getState()
    expect(state.workspace.automationLanes["3-audio"]).toEqual([volume, pan])
    expect(state.session.automationTargets).toEqual({})
    expect(state.document.tracks.find(track => track.id === "3-audio")?.automation).toHaveLength(2)
    const invalid = JSON.parse(saved)
    invalid.workspace.automationLanes["3-audio"][1] = {
      kind: "device",
      deviceId: "missing",
      parameter: "frequency",
    }
    expect(() => hydrateProject(JSON.stringify(invalid))).toThrow()
    invalid.workspace.automationLanes["3-audio"][1] = pan
    invalid.document.tracks.find(
      (track: { id: string }) => track.id === "3-audio"
    ).automation[0].target = { kind: "device", deviceId: "missing", parameter: "frequency" }
    expect(() => hydrateProject(JSON.stringify(invalid))).toThrow()
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
})
