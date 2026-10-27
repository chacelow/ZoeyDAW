// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { createProjectRuntime } from "@zoeydaw/project-runtime"
import { createMockProjectBackend } from "@zoeydaw/project-runtime/testing"
import { initialDocument, initialWorkspace, initialSession } from "@zoeydaw/project-runtime/state"
import { createProjectFileController } from "./controller"
import { createManifest, parseManifest } from "./format"
import { createClip, createTrack } from "@zoeydaw/project-core/reducers"
import { createDevice } from "@zoeydaw/project-core/devices"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"
import { ensurePatternReferences } from "@zoeydaw/project-core/patterns"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import type { ProjectState } from "@zoeydaw/project-core/types"
import type { MediaSource } from "@zoeydaw/project-core/media"
import type { nativeProjectStorage } from "@/shared/native/project-storage"
import type { AudioImportPreferences } from "@/shared/app-shared/audio-import-preferences"

type SaveRequest = Parameters<typeof nativeProjectStorage.saveProject>[0]
const disposers: (() => void)[] = []
const source: MediaSource = {
  id: "d6d42dc2-d1d2-46bc-b516-a19b113fddad",
  name: "Voice.wav",
  sha256: "a".repeat(64),
  byteLength: 960044,
  sampleRate: 48000,
  frames: 240000,
  channels: 2,
  location: { kind: "external", path: "/recordings/Voice.wav" },
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
function setup(getImportPreferences: () => AudioImportPreferences = () => ({ autoWarp: true })) {
  const store = createStore<ProjectState>(() => ({
    document: initialDocument(DEFAULT_TRACK_HEIGHT),
    workspace: initialWorkspace(),
    session: initialSession(),
  }))
  const runtime = createProjectRuntime({
    store,
    backendFactory: createMockProjectBackend,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
  })
  disposers.push(runtime.startProjectRuntime())
  const port = {
    available: () => true,
    pickProject: vi.fn(async () => "/projects/song.zdaw"),
    pickSavePath: vi.fn(async (_defaultPath: string) => "/projects/song.zdaw"),
    pickAudio: vi.fn(async () => "/recordings/Voice.wav"),
    inspectMedia: vi.fn(async (_path: string): Promise<unknown> => structuredClone(source)),
    openProject: vi.fn(async (_path: string): Promise<unknown> => {
      throw new Error("No file")
    }),
    saveProject: vi.fn(async (_request: SaveRequest): Promise<unknown> => {
      throw new Error("No receipt")
    }),
    cancel: vi.fn(async (_id: string) => {}),
    relinkMedia: vi.fn(async (_source: unknown, _path: string): Promise<unknown> => {
      throw new Error("Wrong file")
    }),
  } satisfies typeof nativeProjectStorage
  const route = vi.fn()
  const analyzeTempo = vi.fn(async (_path: string): Promise<{ bpm: number | null }> => ({
    bpm: 120,
  }))
  const snapshotPluginState = vi.fn(async (_sessionId: string, deviceId: string) => {
    const device = runtime
      .get()
      .document.tracks.flatMap(track => track.devices ?? [])
      .find(item => item.id === deviceId)
    if (device?.kind !== "external" || !device.stateRef) throw new Error("Plugin state unavailable")
    return structuredClone(device.stateRef)
  })
  const closeEditors = vi.fn(async () => {})
  const controller = createProjectFileController(
    runtime,
    port,
    route,
    analyzeTempo,
    getImportPreferences,
    snapshotPluginState,
    closeEditors
  )
  controller.files.resetBinding("new-project")
  return { runtime, port, route, analyzeTempo, snapshotPluginState, closeEditors, ...controller }
}
beforeEach(() => localStorage.clear())
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

it("captures an accepted committed revision and never replaces edits made while disk writing", async () => {
  const { runtime, port, files, useState, closeEditors } = setup()
  const edit = runtime.beginEdit("plugin-editor")
  closeEditors.mockImplementationOnce(async () => runtime.endEdit(edit))
  runtime.document({ ...runtime.get().document, name: "First" })
  const disk = deferred<unknown>()
  const started = deferred<SaveRequest>()
  port.saveProject.mockImplementation(request => {
    started.resolve(request)
    return disk.promise
  })
  const saving = files.save()
  const request = await started.promise
  const captured = parseManifest(request.manifest)
  expect(request.collect).toBe(false)
  expect(captured.project.document.name).toBe("First")
  runtime.document({ ...runtime.get().document, name: "Later" })
  disk.resolve({ path: request.path, manifest: captured, durability: "synced" })
  expect(await saving).toBe("new-project")
  expect(runtime.get().document.name).toBe("Later")
  expect(runtime.get().session.dirty).toBe(true)
  expect(useState.getState().binding?.commitId).toBe(captured.commitId)
})

it("keeps a cancelled disk save dirty and keeps the old binding and recent locators", async () => {
  const { runtime, port, files, useState } = setup()
  runtime.document({ ...runtime.get().document, name: "Unsaved" })
  const disk = deferred<unknown>()
  const started = deferred<undefined>()
  port.saveProject.mockImplementation(() => {
    started.resolve(undefined)
    return disk.promise
  })
  const saving = files.save()
  await started.promise
  await files.cancel()
  disk.reject({ code: "cancelled", message: "Cancelled before publish" })
  expect(await saving).toBeNull()
  expect(runtime.get().document.name).toBe("Unsaved")
  expect(runtime.get().session.dirty).toBe(true)
  expect(useState.getState()).toMatchObject({
    binding: null,
    recent: [],
    notice: "cancelled",
    operation: { kind: "idle" },
  })
  expect(port.cancel).toHaveBeenCalledOnce()
})

it("binds a publication that wins cancellation but leaves uncertain durability dirty", async () => {
  const { runtime, port, files, useState } = setup()
  runtime.document({ ...runtime.get().document, name: "Unsynced" })
  const disk = deferred<unknown>()
  const started = deferred<SaveRequest>()
  port.saveProject.mockImplementation(request => {
    started.resolve(request)
    return disk.promise
  })
  const saving = files.save()
  const request = await started.promise
  await files.cancel()
  disk.resolve({
    path: request.path,
    manifest: parseManifest(request.manifest),
    durability: "published-sync-uncertain",
  })
  await saving
  expect(useState.getState().binding?.path).toBe(request.path)
  expect(useState.getState().notice).toBe("syncUncertain")
  expect(runtime.get().session.dirty).toBe(true)
})

it("validates a complete open payload before asking to discard or replacing current state", async () => {
  const { runtime, port, files, useState, route } = setup()
  runtime.document({ ...runtime.get().document, name: "Keep me" })
  const previous = runtime.get()
  const corrupt = createManifest("bad", initialDocument(DEFAULT_TRACK_HEIGHT), initialWorkspace())
  port.openProject.mockResolvedValue({
    path: "/bad.zdaw",
    manifest: {
      ...corrupt,
      project: { ...corrupt.project, document: { ...corrupt.project.document, tracks: [] } },
    },
    issues: [],
  })
  expect(await files.open()).toBeNull()
  expect(runtime.get()).toBe(previous)
  expect(useState.getState().confirmDiscard).toBe(false)
  expect(useState.getState().binding).toBeNull()
  expect(route).not.toHaveBeenCalled()
})

it("cancels the unsaved-open prompt without replacing state or touching recent locators", async () => {
  const { runtime, port, files, useState } = setup()
  runtime.document({ ...runtime.get().document, name: "Keep me" })
  const manifest = createManifest(
    "other",
    initialDocument(DEFAULT_TRACK_HEIGHT),
    initialWorkspace()
  )
  port.openProject.mockResolvedValue({ path: "/other.zdaw", manifest, issues: [] })
  const opening = files.open()
  await vi.waitFor(() => expect(useState.getState().confirmDiscard).toBe(true))
  files.resolveDiscard("cancel")
  expect(await opening).toBeNull()
  expect(runtime.get().document.name).toBe("Keep me")
  expect(useState.getState().recent).toEqual([])
})

it("does not discard an old project or undo history when the candidate backend rejects open", async () => {
  const { runtime, port, files, useState, route } = setup()
  runtime.document({ ...runtime.get().document, name: "Keep history" })
  let instances = 0
  const remove = runtime.configureProjectBackend(() => {
    instances++
    if (instances === 1) return createMockProjectBackend()
    return {
      ...createMockProjectBackend(),
      apply: request => ({
        kind: "rejected",
        sessionId: request.sessionId,
        sequence: request.sequence,
        controlGeneration: request.controlGeneration,
        code: "rejected",
      }),
    }
  })
  disposers.push(remove)
  const manifest = createManifest(
    "other",
    initialDocument(DEFAULT_TRACK_HEIGHT),
    initialWorkspace()
  )
  port.openProject.mockResolvedValue({ path: "/other.zdaw", manifest, issues: [] })
  const opening = files.open()
  await vi.waitFor(() => expect(useState.getState().confirmDiscard).toBe(true))
  files.resolveDiscard("discard")
  expect(await opening).toBeNull()
  expect(runtime.get().document.name).toBe("Keep history")
  expect(runtime.get().session.canUndo).toBe(true)
  expect(useState.getState().binding).toBeNull()
  expect(route).not.toHaveBeenCalled()
  runtime.undo()
  expect(runtime.get().document.name).toBe(initialDocument(DEFAULT_TRACK_HEIGHT).name)
})

it("imports media and audio clip in one undoable transaction with a meter-scaled duration", async () => {
  const { runtime, files } = setup()
  runtime.document({
    ...runtime.get().document,
    transport: { ...runtime.get().document.transport, bpm: 120, numerator: 3, denominator: 8 },
  })
  const before = runtime.get().document
  const id = await files.importAudio()
  const doc = runtime.get().document
  expect(doc.media).toEqual([source])
  const track = doc.tracks.find(item => item.clips.some(clip => clip.id === id))
  expect(doc.tracks.find(item => item.id === before.tracks[0].id)).toEqual(before.tracks[0])
  expect(track?.clips[0]).toMatchObject({
    id,
    sourceId: source.id,
    startBar: 1,
    lengthBars: 20 / 3,
  })
  expect(runtime.get().session.editingClipId).toBeNull()
  runtime.undo()
  expect(runtime.get().document).toBe(before)
  runtime.redo()
  expect(runtime.get().document.media).toEqual([source])
  expect(runtime.get().document.tracks.find(item => item.id === track?.id)?.clips).toHaveLength(1)
})

it("matches source tempo on import and fixes source BPM across project tempo changes", async () => {
  const { runtime, files, analyzeTempo } = setup()
  runtime.document({
    ...runtime.get().document,
    transport: { ...runtime.get().document.transport, bpm: 144 },
  })
  await files.importAudioAt({
    path: source.location.kind === "external" ? source.location.path : "",
    startBar: 3,
  })
  const clip = runtime
    .get()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.kind === "audio")
  expect(analyzeTempo).toHaveBeenCalledWith("/recordings/Voice.wav")
  expect(clip).toMatchObject({
    startBar: 3,
    lengthBars: 2.5,
    audioSettings: { sourceBpm: 120, warp: true },
  })
  runtime.document({
    ...runtime.get().document,
    transport: { ...runtime.get().document.transport, bpm: 160 },
  })
  expect(
    runtime
      .get()
      .document.tracks.flatMap(track => track.clips)
      .find(item => item.id === clip?.id)
  ).toMatchObject({ audioSettings: { sourceBpm: 120 } })
})

it.each(["picker", "drop"])(
  "keeps undetectable %s audio at original speed with a notice",
  async path => {
    const { runtime, files, analyzeTempo, useState } = setup()
    analyzeTempo.mockResolvedValue({ bpm: null })
    if (path === "picker") await files.importAudio()
    else await files.importAudioAt({ path: "/recordings/Voice.wav", startBar: 1 })
    expect(
      runtime
        .get()
        .document.tracks.flatMap(track => track.clips)
        .find(item => item.kind === "audio")
    ).toMatchObject({ sourceTempo: "unknown", audioSettings: { warp: false } })
    expect(useState.getState().notice).toBe("tempoUnknown")
  }
)

it.each(["picker", "drop"])(
  "skips analysis and preserves raw duration with Auto-Warp off for %s",
  async path => {
    const { runtime, files, analyzeTempo, useState } = setup(() => ({ autoWarp: false }))
    runtime.document({
      ...runtime.get().document,
      transport: { ...runtime.get().document.transport, bpm: 144 },
    })
    const before = runtime.get().document
    if (path === "picker") await files.importAudio()
    else await files.importAudioAt({ path: "/recordings/Voice.wav", startBar: 1 })
    expect(analyzeTempo).not.toHaveBeenCalled()
    expect(useState.getState().notice).toBe("imported")
    expect(runtime.get().document.transport.bpm).toBe(144)
    expect(
      runtime
        .get()
        .document.tracks.flatMap(track => track.clips)
        .find(clip => clip.kind === "audio")
    ).toMatchObject({ lengthBars: 3, audioSettings: { warp: false } })
    runtime.undo()
    expect(runtime.get().document).toBe(before)
    runtime.redo()
    expect(
      runtime
        .get()
        .document.tracks.flatMap(track => track.clips)
        .find(clip => clip.kind === "audio")
    ).toMatchObject({ lengthBars: 3, audioSettings: { warp: false } })
  }
)

it.each(["picker", "drop"])(
  "captures Auto-Warp before asynchronous %s import begins",
  async path => {
    let autoWarp = true
    const { files, port, analyzeTempo, runtime } = setup(() => ({ autoWarp }))
    const inspected = deferred<unknown>()
    port.inspectMedia.mockReturnValueOnce(inspected.promise)
    const importing =
      path === "picker"
        ? files.importAudio()
        : files.importAudioAt({ path: "/recordings/Voice.wav", startBar: 1 })
    autoWarp = false
    inspected.resolve(structuredClone(source))
    await importing
    expect(analyzeTempo).toHaveBeenCalledOnce()
    expect(
      runtime
        .get()
        .document.tracks.flatMap(track => track.clips)
        .find(clip => clip.kind === "audio")
    ).toMatchObject({ audioSettings: { warp: true, sourceBpm: 120 } })
  }
)

it.each(["picker", "drop"])(
  "does not enable Warp midway through a disabled %s import",
  async path => {
    let autoWarp = false
    const { files, port, analyzeTempo, runtime, useState } = setup(() => ({ autoWarp }))
    const inspected = deferred<unknown>()
    port.inspectMedia.mockReturnValueOnce(inspected.promise)
    const importing =
      path === "picker"
        ? files.importAudio()
        : files.importAudioAt({ path: "/recordings/Voice.wav", startBar: 1 })
    autoWarp = true
    inspected.resolve(structuredClone(source))
    await importing
    expect(analyzeTempo).not.toHaveBeenCalled()
    expect(useState.getState().notice).toBe("imported")
    expect(
      runtime
        .get()
        .document.tracks.flatMap(track => track.clips)
        .find(clip => clip.kind === "audio")
    ).toMatchObject({ audioSettings: { warp: false } })
  }
)

it("captures Auto-Warp before the file picker resolves", async () => {
  let autoWarp = true
  const { files, port, analyzeTempo } = setup(() => ({ autoWarp }))
  const picked = deferred<string>()
  port.pickAudio.mockReturnValueOnce(picked.promise)
  const importing = files.importAudio()
  autoWarp = false
  picked.resolve("/recordings/Voice.wav")
  await importing
  expect(analyzeTempo).toHaveBeenCalledOnce()
})

it.each([60, 144, 200])(
  "converts original seconds into the current %s BPM grid without Warp",
  async bpm => {
    const { runtime, files } = setup(() => ({ autoWarp: false }))
    runtime.document({
      ...runtime.get().document,
      transport: { ...runtime.get().document.transport, bpm },
    })
    await files.importAudio()
    const clip = runtime
      .get()
      .document.tracks.flatMap(track => track.clips)
      .find(clip => clip.kind === "audio")
    expect(clip?.lengthBars).toBeCloseTo((5 * bpm) / 240)
    expect(clip).toMatchObject({ audioSettings: { warp: false } })
  }
)

it.each([60, 144, 200])(
  "keeps imported source beats fixed and project BPM %s unchanged",
  async bpm => {
    const { runtime, files } = setup()
    runtime.document({
      ...runtime.get().document,
      transport: { ...runtime.get().document.transport, bpm },
    })
    await files.importAudio()
    expect(runtime.get().document.transport.bpm).toBe(bpm)
    expect(
      runtime
        .get()
        .document.tracks.flatMap(track => track.clips)
        .find(clip => clip.kind === "audio")
    ).toMatchObject({ lengthBars: 2.5, audioSettings: { sourceBpm: 120, warp: true } })
  }
)

it.each([NaN, Infinity, 0, -1, 1000])("does not author invalid analyzed BPM %s", async bpm => {
  const { runtime, files, analyzeTempo, useState } = setup()
  analyzeTempo.mockResolvedValue({ bpm })
  await files.importAudio()
  expect(useState.getState().notice).toBe("tempoUnknown")
  expect(
    runtime
      .get()
      .document.tracks.flatMap(track => track.clips)
      .find(clip => clip.kind === "audio")
  ).toMatchObject({ audioSettings: { warp: false } })
})

it("imports raw audio with a notice when tempo analysis fails", async () => {
  const { files, analyzeTempo, useState } = setup()
  analyzeTempo.mockRejectedValue(new Error("Analysis unavailable"))
  expect(await files.importAudio()).not.toBeNull()
  expect(useState.getState().notice).toBe("tempoUnknown")
})

it("creates a new track for empty-area placement instead of the selected Audio track", async () => {
  const { files, runtime } = setup()
  const audio = runtime.get().document.tracks.find(track => track.kind === "audio")!
  runtime.session({ selectedTrackIds: [audio.id] })
  const before = runtime.get().document
  const id = await files.importAudioAt({ path: "/recordings/Voice.wav", startBar: 2 })
  expect(runtime.get().document.tracks.find(track => track.id === audio.id)).toEqual(audio)
  expect(
    runtime.get().document.tracks.find(track => track.clips.some(clip => clip.id === id))?.id
  ).not.toBe(audio.id)
  runtime.undo()
  expect(runtime.get().document).toBe(before)
})

it("overwrites only the imported interval and restores media and true source fragments in one undo", async () => {
  const { runtime, files } = setup()
  const document = runtime.get().document
  const target = document.tracks.find(track => track.kind === "audio")!
  const existing = { ...createClip("audio", 1, 12), sourceOffsetBars: -2 }
  runtime.document({
    ...document,
    transport: { ...document.transport, bpm: 120, numerator: 4, denominator: 4 },
    tracks: document.tracks.map(track =>
      track.id === target.id ? { ...track, clips: [existing] } : track
    ),
  })
  const before = runtime.get().document
  const id = await files.importAudioAt({
    path: "/recordings/Voice.wav",
    trackId: target.id,
    startBar: 5,
  })
  const after = runtime.get().document
  const clips = after.tracks.find(track => track.id === target.id)!.clips
  expect(clips).toHaveLength(3)
  expect(clips.find(clip => clip.id === existing.id)).toMatchObject({
    startBar: 1,
    lengthBars: 4,
    sourceOffsetBars: -2,
  })
  expect(clips.find(clip => clip.id === id)).toMatchObject({
    startBar: 5,
    lengthBars: 2.5,
    sourceId: source.id,
  })
  expect(clips.find(clip => clip.startBar === 7.5)).toMatchObject({
    lengthBars: 5.5,
    sourceOffsetBars: 4.5,
  })
  runtime.undo()
  expect(runtime.get().document).toBe(before)
  runtime.redo()
  expect(runtime.get().document).toBe(after)
})

it.each(["empty", "midi", "pattern"])(
  "converts the original %s MIDI track in one reversible import",
  async content => {
    const { files, runtime } = setup()
    const document = runtime.get().document
    const midi = {
      ...createTrack("midi", document.tracks, undefined, DEFAULT_TRACK_HEIGHT),
      name: "Keep this identity",
      color: "var(--chart-4)",
      volumeDb: -6,
      pan: 0.25,
      armed: true,
      devices: [
        createDevice("utility"),
        createDevice("filter"),
        createDevice("delay"),
        createDevice("reverb"),
      ],
      clips: content === "empty" ? [] : [createClip(content === "midi" ? "midi" : "pattern", 2, 2)],
    }
    runtime.document(ensurePatternReferences({ ...document, tracks: [midi, ...document.tracks] }))
    const before = runtime.get().document
    const clipId = await files.importAudioAt({
      path: "/recordings/Voice.wav",
      trackId: midi.id,
      startBar: 3,
    })
    const after = runtime.get().document
    const converted = after.tracks.find(track => track.id === midi.id)
    expect(after.tracks).toHaveLength(before.tracks.length)
    expect(converted).toMatchObject({
      id: midi.id,
      name: midi.name,
      kind: "audio",
      color: midi.color,
      volumeDb: midi.volumeDb,
      pan: midi.pan,
      armed: midi.armed,
      devices: midi.devices,
      input: "external",
      inputChannel: "1",
      output: "main",
      outputChannel: "1-2",
      clips: [{ id: clipId, kind: "audio", sourceId: source.id, startBar: 3 }],
    })
    expect(converted?.clips).toHaveLength(1)
    expect(after.media).toEqual([source])
    runtime.undo()
    expect(runtime.get().document).toBe(before)
    expect(runtime.get().document.tracks.find(track => track.id === midi.id)?.clips).toEqual(
      midi.clips
    )
    runtime.redo()
    expect(runtime.get().document).toBe(after)
  }
)

it("preserves a MIDI track's valid group parent when switching its routing to Audio", async () => {
  const { files, runtime } = setup()
  const document = runtime.get().document
  const group = createTrack("group", document.tracks, undefined, DEFAULT_TRACK_HEIGHT)
  const midi = createTrack("midi", document.tracks, undefined, DEFAULT_TRACK_HEIGHT)
  group.childTrackIds = [midi.id]
  runtime.document({ ...document, tracks: [group, midi, ...document.tracks] })
  const before = runtime.get().document
  await files.importAudioAt({ path: "/recordings/Voice.wav", trackId: midi.id, startBar: 1 })
  expect(runtime.get().document.tracks.find(track => track.id === midi.id)).toMatchObject({
    kind: "audio",
    output: group.id,
  })
  expect(runtime.get().document.tracks.find(track => track.id === group.id)).toEqual(group)
  runtime.undo()
  expect(runtime.get().document).toBe(before)
})

it("rejects a wrong relink fingerprint without editing media or dropping its missing issue", async () => {
  const { runtime, port, files, useState } = setup()
  const manifest = createManifest(
    "missing",
    { ...initialDocument(DEFAULT_TRACK_HEIGHT), media: [source] },
    initialWorkspace()
  )
  const issue = { sourceId: source.id, kind: "missing", path: "/recordings/Voice.wav" }
  port.openProject.mockResolvedValue({ path: "/projects/missing.zdaw", manifest, issues: [issue] })
  await files.open()
  const before = runtime.get().document
  port.relinkMedia.mockResolvedValue({
    ...source,
    sha256: "b".repeat(64),
    location: { kind: "external", path: "/wrong.wav" },
  })
  expect(await files.relink(source.id)).toBeNull()
  expect(runtime.get().document).toBe(before)
  expect(useState.getState().issues).toEqual([issue])
  expect(runtime.get().session.dirty).toBe(false)
  expect(port.saveProject).not.toHaveBeenCalled()
})

it("restores location-keyed missing issues when relink is undone and hides them again on redo", async () => {
  const { runtime, port, files, useState } = setup()
  const manifest = createManifest(
    "missing-history",
    { ...initialDocument(DEFAULT_TRACK_HEIGHT), media: [source] },
    initialWorkspace()
  )
  const issue = { sourceId: source.id, kind: "missing", path: "/recordings/Voice.wav" }
  port.openProject.mockResolvedValue({ path: "/projects/missing.zdaw", manifest, issues: [issue] })
  await files.open()
  expect(files.mediaIssues()).toEqual([issue])
  port.pickAudio.mockResolvedValue("/restored/Voice.wav")
  port.relinkMedia.mockResolvedValue({
    ...source,
    location: { kind: "external", path: "/restored/Voice.wav" },
  })
  expect(await files.relink(source.id)).toBe(source.id)
  expect(files.mediaIssues()).toEqual([])
  expect(useState.getState().issues).toEqual([issue])
  runtime.undo()
  expect(runtime.get().document.media[0].location).toEqual(source.location)
  expect(files.mediaIssues()).toEqual([issue])
  runtime.redo()
  expect(runtime.get().document.media[0].location).toEqual({
    kind: "external",
    path: "/restored/Voice.wav",
  })
  expect(files.mediaIssues()).toEqual([])
  expect(port.relinkMedia).toHaveBeenCalledOnce()
  expect(port.inspectMedia).not.toHaveBeenCalled()
})

it("does not resurrect an issue after the original on-disk location itself was verified restored", async () => {
  const { runtime, port, files, useState } = setup()
  const manifest = createManifest(
    "restored-in-place",
    { ...initialDocument(DEFAULT_TRACK_HEIGHT), media: [source] },
    initialWorkspace()
  )
  port.openProject.mockResolvedValue({
    path: "/projects/missing.zdaw",
    manifest,
    issues: [{ sourceId: source.id, kind: "missing", path: "/recordings/Voice.wav" }],
  })
  await files.open()
  port.relinkMedia.mockResolvedValue(structuredClone(source))
  await files.relink(source.id)
  expect(files.mediaIssues()).toEqual([])
  expect(useState.getState().issues).toEqual([])
  runtime.undo()
  expect(files.mediaIssues()).toEqual([])
})

it("keeps collected bindings over relink and undo without overwriting the document with receipts", async () => {
  const { runtime, port, files } = setup()
  await files.importAudio()
  const captured = runtime.get().document
  port.saveProject.mockImplementation(async request => {
    const manifest = parseManifest(request.manifest)
    return {
      path: request.path,
      manifest: {
        ...manifest,
        project: {
          ...manifest.project,
          document: {
            ...manifest.project.document,
            media: [{ ...source, location: { kind: "project", path: `media/${source.id}.wav` } }],
          },
        },
      },
      durability: "synced",
    }
  })
  await files.collect()
  expect(runtime.get().document).toBe(captured)
  expect(files.externalDependencyCount()).toBe(0)
  port.relinkMedia.mockResolvedValue({
    ...source,
    location: { kind: "external", path: "/new/Voice.wav" },
  })
  await files.relink(source.id)
  expect(runtime.get().document.media[0].location).toEqual({
    kind: "external",
    path: "/new/Voice.wav",
  })
  runtime.undo()
  await files.save()
  const last = port.saveProject.mock.calls.at(-1)?.[0]
  expect(last && parseManifest(last.manifest).project.document.media[0].location).toEqual({
    kind: "external",
    path: `/projects/media/${source.id}.wav`,
  })
})

it("uses collected plugin state on Save As without replacing newer authored edits", async () => {
  const { runtime, port, files, snapshotPluginState } = setup()
  const device = {
    id: "external",
    kind: "external",
    enabled: true,
    collapsed: false,
    plugin: {
      catalogId: "a".repeat(64),
      format: "clap",
      classId: "fixture",
      name: "Fixture",
      vendor: "",
      version: "1",
      role: "effect",
    },
    stateRef: { sha256: "b".repeat(64), path: `/cache/${"b".repeat(64)}.zdps` },
    parameters: [{ id: "18446744073709551615", normalized: 0.25 }],
  } satisfies ExternalDevice
  const track = runtime.get().document.tracks[0]
  runtime.updateTrack(track.id, { devices: [device] })
  port.saveProject.mockImplementation(async request => {
    const manifest = parseManifest(request.manifest)
    for (const track of manifest.project.document.tracks)
      for (const device of track.devices ?? []) {
        if (device.kind === "external" && device.stateRef)
          device.stateRef.path = `plugin-state/${device.stateRef.sha256}.zdps`
      }
    return { path: request.path, manifest, durability: "synced" }
  })
  expect(await files.save()).toBe("new-project")
  runtime.updateTrack(track.id, {
    devices: [{ ...device, parameters: [{ id: "18446744073709551615", normalized: 0.75 }] }],
  })
  port.pickSavePath.mockResolvedValue("/portable/song.zdaw")
  expect(await files.saveAs()).toBe("new-project")
  const second = parseManifest(port.saveProject.mock.calls[1][0].manifest)
  const stored = second.project.document.tracks[0].devices?.[0]
  expect(stored?.kind).toBe("external")
  if (stored?.kind !== "external") throw new Error("Missing external device")
  expect(stored.stateRef?.path).toBe(`/projects/plugin-state/${"b".repeat(64)}.zdps`)
  expect(stored.parameters[0].normalized).toBe(0.75)
  expect(await files.save()).toBe("new-project")
  const third = parseManifest(port.saveProject.mock.calls[2][0].manifest)
  const relocated = third.project.document.tracks[0].devices?.[0]
  if (relocated?.kind !== "external") throw new Error("Missing relocated external device")
  expect(relocated.stateRef?.path).toBe(`/portable/plugin-state/${"b".repeat(64)}.zdps`)
  expect(files.resolvePluginState(device.stateRef).path).toBe(
    `/portable/plugin-state/${"b".repeat(64)}.zdps`
  )
  const newerState = { sha256: "c".repeat(64), path: "/cache/newer.zdps" }
  expect(files.resolvePluginState(newerState)).toBe(newerState)
  expect(runtime.get().document.tracks[0].devices?.[0]).toEqual({
    ...device,
    parameters: [{ id: "18446744073709551615", normalized: 0.75 }],
  })
  const liveState = { sha256: "d".repeat(64), path: "/cache/live.zdps" }
  snapshotPluginState.mockResolvedValueOnce(liveState)
  expect(await files.save()).toBe("new-project")
  const latest = parseManifest(port.saveProject.mock.calls.at(-1)![0].manifest).project.document
    .tracks[0].devices?.[0]
  if (latest?.kind !== "external") throw new Error("Missing live plugin state")
  expect(latest.stateRef?.sha256).toBe(liveState.sha256)
  expect(runtime.get().document.tracks[0].devices?.[0]).toEqual({
    ...device,
    parameters: [{ id: "18446744073709551615", normalized: 0.75 }],
  })
  const publications = port.saveProject.mock.calls.length
  snapshotPluginState.mockRejectedValueOnce(new Error("Plugin worker stopped"))
  expect(await files.save()).toBeNull()
  expect(port.saveProject.mock.calls).toHaveLength(publications)
  snapshotPluginState.mockImplementationOnce(async () => {
    runtime.updateTrack(track.id, { name: "Edited during plugin capture" })
    return liveState
  })
  expect(await files.save()).toBeNull()
  expect(port.saveProject.mock.calls).toHaveLength(publications)
  expect(runtime.get().document.tracks[0].name).toBe("Edited during plugin capture")
})
