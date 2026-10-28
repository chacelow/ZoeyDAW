// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { createProjectRuntime } from "@zoeydaw/project-runtime"
import { createMockProjectBackend } from "@zoeydaw/project-runtime/testing"
import { initialDocument, initialWorkspace, initialSession } from "@zoeydaw/project-runtime/state"
import { createProjectFileController } from "./controller"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import type { ProjectState } from "@zoeydaw/project-core/types"
import type { MediaSource } from "@zoeydaw/project-core/media"
import type { AudioImportPreferences } from "@/shared/app-shared/audio-import-preferences"

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
    pickProject: vi.fn(),
    pickSavePath: vi.fn(),
    pickAudio: vi.fn(async () => "/recordings/Voice.wav"),
    inspectMedia: vi.fn(async (_path: string): Promise<MediaSource> => structuredClone(source)),
    saveProject: vi.fn(),
    openProject: vi.fn(),
    cancel: vi.fn(async (_id: string) => {}),
    relinkMedia: vi.fn(),
  }
  const route = vi.fn()
  const analyzeTempo = vi.fn(async (_path: string): Promise<{ bpm: number | null }> => ({
    bpm: 120,
  }))
  const snapshotPluginState = vi.fn(async (_sessionId: string, _deviceId: string) => ({
    sha256: "0".repeat(64),
    path: "/plugins/state/0",
  }))
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
  vi.restoreAllMocks()
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
    audioSettings: { sourceBpm: 120, warp: true, warpMode: "signalsmith" },
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

it("extracts BPM from filename when signal analysis returns null and enables warp", async () => {
  const { runtime, files, analyzeTempo, port } = setup()
  analyzeTempo.mockResolvedValue({ bpm: null })
  port.inspectMedia.mockResolvedValueOnce({
    ...source,
    name: "Cymatics - Bang Full Drum Loop 2 - 121 BPM.wav",
  })
  await files.importAudioAt({
    path: "/recordings/Cymatics - Bang Full Drum Loop 2 - 121 BPM.wav",
    startBar: 1,
  })
  const clip = runtime
    .get()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.kind === "audio")
  expect(clip).toMatchObject({
    audioSettings: { sourceBpm: 121, warp: true, warpMode: "signalsmith" },
  })
  expect(clip?.sourceTempo).toBeUndefined()
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
    const inspected = deferred<MediaSource>()
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
    const inspected = deferred<MediaSource>()
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
