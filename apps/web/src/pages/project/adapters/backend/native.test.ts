// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import logger from "@zoeymind/logger"
import { readNativeAudioStatus } from "@/shared/native/audio"
import { createStore } from "zustand/vanilla"
import { createProjectRuntime } from "@zoeydaw/project-runtime"
import { initialDocument, initialSession, initialWorkspace } from "@zoeydaw/project-runtime/state"
import type { ProjectState } from "@zoeydaw/project-core/types"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { createNativeBrowserAuditionPort, createNativeProjectBackend } from "./native"
import type {
  BackendControlRequest,
  BackendNoteRequest,
  BackendDocumentRequest,
  BackendResult,
} from "@zoeydaw/project-core/backend"
import * as sourceLocations from "./source-locations"
import * as waveforms from "./waveforms"
import type { MeterSessionPort } from "@zoeydaw/project-runtime/realtime"
import type { RealtimeStreamOpenResult } from "@zoeydaw/project-core/realtime"
import { readProjectMeters } from "../realtime"
import type {
  AudioDeviceSnapshot,
  NativeAudioPort,
  NativeAuditionResult,
  NativeNoteResult,
  NativePlaybackResult,
  NativeRecording,
  NativeRecordingResults,
  NativeAuditionStatus,
  PlaybackSnapshot,
} from "@/shared/native/audio"

const device: AudioDeviceSnapshot = {
  state: "ready",
  host: "CoreAudio",
  deviceId: "built-in",
  deviceName: "Built-in",
  sampleRate: 44100,
  bufferFrames: 512,
  outputChannels: 2,
  devices: [],
  hosts: [{ id: "CoreAudio", name: "CoreAudio", separateInputOutput: true, controlPanel: false }],
  inputDevices: [],
  outputDevices: [],
  configuration: {
    host: "CoreAudio",
    inputDeviceId: null,
    outputDeviceId: "built-in",
    sampleRate: 44100,
    bufferFrames: 512,
    inputMono: [],
    inputStereo: [],
    outputMono: [0, 1],
    outputStereo: [0],
  },
  capabilities: {
    host: "CoreAudio",
    inputDeviceId: null,
    outputDeviceId: "built-in",
    inputChannelNames: [],
    outputChannelNames: ["1", "2"],
    sampleRates: [44100, 48000],
    bufferSizes: [128, 256, 512],
    defaultSampleRate: 44100,
    defaultBufferFrames: 512,
    separateInputOutput: true,
    controlPanel: false,
  },
  inputDeviceId: null,
  inputDeviceName: null,
  inputChannels: 0,
  inputLatencyFrames: 0,
  outputLatencyFrames: 512,
  error: null,
}
const telemetry: PlaybackSnapshot["telemetry"] = {
  sessionId: "s",
  sequence: 1,
  appliedSequence: 0,
  controlGeneration: "0",
  clock: { kind: "sample", bar: 2, barsPerSecond: 0.5, frame: 88200, sampleRate: 44100 },
  playing: true,
  recording: false,
}
const snapshot: PlaybackSnapshot = { device, telemetry, issues: [], meterReady: true }
const recording: NativeRecording = {
  recordingId: "recording-1",
  sessionId: "s",
  sourceBpm: 120,
  sources: [
    {
      id: "file-1",
      name: "take.wav",
      sha256: "a".repeat(64),
      byteLength: 192044,
      sampleRate: 48000,
      frames: 48000,
      channels: 2,
      location: { kind: "external", path: "/recordings/take.wav" },
    },
  ],
  clips: [
    {
      clipId: "clip-1",
      fileId: "file-1",
      trackId: "audio-1",
      startBar: 1,
      durationBars: 0.5,
      sourceOffsetBars: 0,
    },
  ],
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
function audioPort(generation = 0) {
  return {
    available: (): boolean => true,
    acquire: vi.fn<NativeAudioPort["acquire"]>(async () => {}),
    apply: vi.fn<NativeAudioPort["apply"]>(async () => ({
      kind: "accepted",
      sessionId: "s",
      sequence: 0,
      revision: 0,
      controlGeneration: "0",
    })),
    control: vi.fn<NativeAudioPort["control"]>(async () => ({
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
      revision: 0,
      controlGeneration: "1",
    })),
    note: vi.fn<NativeAudioPort["note"]>(async () => ({
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
    })),
    allNotesOff: vi.fn<NativeAudioPort["allNotesOff"]>(async () => {}),
    telemetry: vi.fn<NativeAudioPort["telemetry"]>(async () => snapshot),
    recordingResults: vi.fn<NativeAudioPort["recordingResults"]>(async (_lease, sessionId) => ({
      sessionId,
      recordings: [],
    })),
    recordingAck: vi.fn<NativeAudioPort["recordingAck"]>(async () => {}),
    release: vi.fn<NativeAudioPort["release"]>(async () => {}),
    stop: vi.fn<NativeAudioPort["stop"]>(async () => {}),
    reserveAudition: vi.fn<NativeAudioPort["reserveAudition"]>(async () => ++generation),
    audition: vi.fn<NativeAudioPort["audition"]>(async request => ({
      generation: request.generation,
      durationSeconds: 3,
      state: "playing",
    })),
    stopAudition: vi.fn<NativeAudioPort["stopAudition"]>(async () => {}),
    seekAudition: vi.fn<NativeAudioPort["seekAudition"]>(async () => {}),
    auditionStatus: vi.fn<NativeAudioPort["auditionStatus"]>(async generation => ({
      generation,
      positionSeconds: 1.25,
      durationSeconds: 3,
      playing: true,
    })),
    analyzeTempo: vi.fn<NativeAudioPort["analyzeTempo"]>(async () => ({
      bpm: null,
      origin: "unknown",
    })),
    devices: vi.fn<NativeAudioPort["devices"]>(async () => device),
    configureDevice: vi.fn<NativeAudioPort["configureDevice"]>(async () => device),
    deviceCapabilities: vi.fn<NativeAudioPort["deviceCapabilities"]>(
      async () => device.capabilities
    ),
    openDeviceControlPanel: vi.fn<NativeAudioPort["openDeviceControlPanel"]>(async () => device),
  } satisfies NativeAudioPort
}
function request(sequence = 0): BackendDocumentRequest {
  return {
    protocolVersion: 2,
    sessionId: "s",
    sequence,
    baseRevision: 0,
    revision: 0,
    stage: "open",
    editId: null,
    controlGeneration: "0",
    state: {
      project: {
        bpm: 120,
        numerator: 4,
        denominator: 4,
        loop: { enabled: false, startBar: 1, endBar: 5 },
        sources: [],
        tracks: [],
      },
      control: {
        playing: true,
        recording: false,
        seekBar: 1,
        seekGeneration: 0,
      },
    },
  }
}
function controlRequest(): BackendControlRequest {
  return {
    protocolVersion: 2,
    sessionId: "s",
    sequence: 1,
    controlGeneration: "1",
    control: { playing: false, recording: false, seekBar: 3, seekGeneration: 1 },
  }
}
function noteRequest(): BackendNoteRequest {
  return {
    protocolVersion: 2,
    sessionId: "s",
    sequence: 1,
    note: { trackId: "t", noteId: "key-1", pitch: 60, velocity: 100, on: true },
  }
}
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("native project backend", () => {
  it("does not acquire on import/factory/subscription and releases only its lease once", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const backend = createNativeProjectBackend(port)
    const unsubscribe = backend.subscribe(vi.fn())
    expect(port.apply).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    backend.dispose()
    unsubscribe()
    expect(port.release).not.toHaveBeenCalled()
    const first = createNativeProjectBackend(port)
    const second = createNativeProjectBackend(port)
    await first.apply(request())
    await second.apply(request())
    const firstLease = port.apply.mock.calls[0][1]
    const secondLease = port.apply.mock.calls[1][1]
    expect(firstLease).not.toBe(secondLease)
    first.dispose()
    first.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release.mock.calls).toEqual([[firstLease]])
    second.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release.mock.calls).toEqual([[firstLease], [secondLease]])
  })

  it("waits for a late meter admission to close before releasing the audio lease", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const opening = deferred<RealtimeStreamOpenResult>()
    const closing = deferred<undefined>()
    const meterPort: MeterSessionPort = {
      open: vi.fn(() => opening.promise),
      registry: vi.fn(),
      clock: vi.fn(),
      interest: vi.fn(async () => {}),
      snapshot: vi.fn(),
      receipt: vi.fn(),
      reset: vi.fn(),
      close: vi.fn(() => closing.promise),
    }
    const backend = createNativeProjectBackend(port, { meters: meterPort })
    port.telemetry.mockResolvedValueOnce({ ...snapshot, meterReady: false })
    await backend.apply(request())
    expect(readProjectMeters()).toBeNull()
    const unsubscribe = backend.subscribe(vi.fn())
    await vi.advanceTimersByTimeAsync(40)
    expect(readProjectMeters()).toBeNull()
    expect(meterPort.open).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(40)
    expect(readProjectMeters()).not.toBeNull()
    backend.dispose()
    expect(readProjectMeters()).toBeNull()
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release).not.toHaveBeenCalled()
    opening.resolve({
      streamId: 7,
      registry: {
        sessionId: "s",
        sessionEpoch: 1,
        deviceEpoch: 1,
        generation: 1,
        registryRevision: 1,
        resetEpoch: 0,
        entries: [],
        sources: [],
        endpointResets: [],
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(meterPort.close).toHaveBeenCalledWith(7)
    expect(port.release).not.toHaveBeenCalled()
    closing.resolve(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release).toHaveBeenCalledOnce()
    expect(meterPort.interest).not.toHaveBeenCalled()
    unsubscribe()
  })

  it("waits for a pending apply before releasing, fences urgent stops, and discards late acceptance", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const pending = deferred<BackendResult>()
    port.apply.mockReturnValueOnce(pending.promise)
    const backend = createNativeProjectBackend(port)
    const applying = backend.apply(request())
    await Promise.resolve()
    await backend.urgentStop()
    expect(port.stop.mock.calls[0][2]).toBe(1)
    await backend.apply(request(1))
    expect(port.apply.mock.calls.map(call => call[2])).toEqual([0, 1])
    backend.dispose()
    expect(port.release).not.toHaveBeenCalled()
    pending.resolve({
      kind: "accepted",
      sessionId: "s",
      sequence: 0,
      revision: 0,
      controlGeneration: "0",
    })
    expect(await applying).toMatchObject({ kind: "rejected", code: "disposed" })
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("surfaces a rejected apply and a command failure without fabricating acceptance", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    port.apply
      .mockResolvedValueOnce({
        kind: "rejected",
        sessionId: "s",
        sequence: 0,
        code: "rejected",
        controlGeneration: "0",
      })
      .mockRejectedValueOnce(new Error("Device disconnected"))
    const backend = createNativeProjectBackend(port)
    expect(await backend.apply(request())).toMatchObject({ kind: "rejected", code: "rejected" })
    expect(await backend.apply(request(1))).toMatchObject({ kind: "rejected", code: "connection" })
    backend.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release).toHaveBeenCalledTimes(1)
  })

  it.each([new Error("Number out of range: sourceOffsetBars"), "Invalid time signature"])(
    "retains the original native exception through recovery and healthy telemetry: %s",
    async error => {
      vi.useFakeTimers()
      const logged = vi.spyOn(logger, "error").mockImplementation(() => {})
      const port = audioPort()
      port.apply.mockImplementation(async raw => {
        const metadata = z
          .object({
            sessionId: z.string(),
            sequence: z.number().int().nonnegative(),
            revision: z.number().int().nonnegative(),
            controlGeneration: z.string(),
          })
          .parse(raw)
        return { kind: "accepted", ...metadata }
      })
      const backend = createNativeProjectBackend(port)
      const unsubscribe = backend.subscribe(vi.fn())
      await backend.apply(request())
      port.apply.mockRejectedValueOnce(error)
      expect(await backend.apply({ ...request(1), stage: "commit" })).toMatchObject({
        kind: "rejected",
        code: "connection",
      })
      const message = error instanceof Error ? error.message : error
      expect(readNativeAudioStatus().error).toBe(message)
      expect(logged).toHaveBeenCalledWith("[NativeProjectBackend] Request failed", {
        operation: "apply",
        sessionId: "s",
        sequence: 1,
        error: message,
      })
      await backend.apply({ ...request(2), stage: "recover" })
      await vi.advanceTimersByTimeAsync(100)
      expect(port.telemetry).toHaveBeenCalled()
      expect(readNativeAudioStatus()).toMatchObject({ device, error: message })
      expect(port.apply).toHaveBeenCalledTimes(3)
      await backend.apply({ ...request(3), stage: "commit" })
      expect(readNativeAudioStatus().error).toBeNull()
      unsubscribe()
      backend.dispose()
      await vi.advanceTimersByTimeAsync(0)
    }
  )

  it("polls only an active subscribed lease and drops telemetry arriving after unsubscription", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const late = deferred<PlaybackSnapshot>()
    port.telemetry.mockReturnValueOnce(late.promise)
    const backend = createNativeProjectBackend(port)
    await backend.apply(request())
    expect(vi.getTimerCount()).toBe(0)
    const listener = vi.fn()
    const unsubscribe = backend.subscribe(listener)
    await vi.advanceTimersByTimeAsync(34)
    expect(port.telemetry).toHaveBeenCalledTimes(1)
    unsubscribe()
    late.resolve(snapshot)
    await vi.advanceTimersByTimeAsync(0)
    expect(listener).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    const cleanup = backend.subscribe(listener)
    await vi.advanceTimersByTimeAsync(34)
    expect(listener).toHaveBeenCalledWith(telemetry)
    cleanup()
    backend.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("explicitly rejects browser playback instead of silently using a mock engine", async () => {
    const port = audioPort()
    port.available = () => false
    const backend = createNativeProjectBackend(port)
    expect(await backend.apply(request())).toMatchObject({ kind: "rejected", code: "connection" })
    expect(port.apply).not.toHaveBeenCalled()
    backend.dispose()
  })

  it("dispatches control and note without source resolution or waveform prewarming", async () => {
    const sources = vi.spyOn(sourceLocations, "resolveBackendSources")
    const warm = vi.spyOn(waveforms, "prepareNativeWaveforms").mockResolvedValue(undefined)
    const port = audioPort()
    const backend = createNativeProjectBackend(port)
    expect(await backend.control(controlRequest())).toMatchObject({
      kind: "rejected",
      code: "protocol",
    })
    await backend.apply(request())
    sources.mockClear()
    warm.mockClear()
    expect(await backend.control(controlRequest())).toMatchObject({
      kind: "accepted",
      controlGeneration: "1",
    })
    expect(await backend.note(noteRequest())).toEqual({
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
    })
    expect(sources).not.toHaveBeenCalled()
    expect(warm).not.toHaveBeenCalled()
    expect(port.apply).toHaveBeenCalledTimes(1)
    expect(port.control).toHaveBeenCalledWith(controlRequest(), port.apply.mock.calls[0][1], 0)
    await backend.urgentStop()
    await backend.note(noteRequest())
    expect(port.note.mock.calls[1][2]).toBe(1)
    backend.dispose()
    await Promise.resolve()
  })

  it("rejects stale control replies and surfaces note-overrun without document acceptance", async () => {
    const port = audioPort()
    const backend = createNativeProjectBackend(port)
    await backend.apply(request())
    port.control.mockResolvedValueOnce({
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
      revision: 0,
      controlGeneration: "0",
    })
    expect(await backend.control(controlRequest())).toMatchObject({
      kind: "rejected",
      code: "protocol",
    })
    port.control.mockResolvedValueOnce({
      kind: "accepted",
      sessionId: "old",
      sequence: 1,
      revision: 0,
      controlGeneration: "1",
    })
    expect(await backend.control(controlRequest())).toMatchObject({
      kind: "rejected",
      code: "protocol",
    })
    port.note.mockResolvedValueOnce({
      kind: "rejected",
      sessionId: "s",
      sequence: 1,
      code: "note-overrun",
    })
    expect(await backend.note(noteRequest())).toEqual({
      kind: "rejected",
      sessionId: "s",
      sequence: 1,
      code: "note-overrun",
    })
    backend.dispose()
    await Promise.resolve()
  })

  it("panics notes without transport stop or document submission and awaits release", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const backend = createNativeProjectBackend(port)
    await backend.apply(request())
    const late = deferred<undefined>()
    port.allNotesOff.mockReturnValueOnce(late.promise)
    const panicking = backend.allNotesOff()
    await Promise.resolve()
    expect(port.allNotesOff).toHaveBeenCalledWith(port.apply.mock.calls[0][1], "s", 0)
    expect(port.stop).not.toHaveBeenCalled()
    expect(port.apply).toHaveBeenCalledTimes(1)
    backend.dispose()
    expect(port.release).not.toHaveBeenCalled()
    late.resolve(undefined)
    await panicking
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release).toHaveBeenCalledTimes(1)
  })

  it("captures delayed dispatched notes in panic cutoff without rejecting later higher notes", async () => {
    const port = audioPort()
    const backend = createNativeProjectBackend(port)
    await backend.apply(request())
    const delayed = deferred<NativeNoteResult>()
    port.note.mockReturnValueOnce(delayed.promise)
    const oldRequest = { ...noteRequest(), sequence: 7 }
    const oldNote = backend.note(oldRequest)
    await backend.allNotesOff()
    expect(port.allNotesOff).toHaveBeenLastCalledWith(port.apply.mock.calls[0][1], "s", 7)
    port.note.mockResolvedValueOnce({ kind: "accepted", sessionId: "s", sequence: 8 })
    expect(await backend.note({ ...noteRequest(), sequence: 8 })).toEqual({
      kind: "accepted",
      sessionId: "s",
      sequence: 8,
    })
    delayed.resolve({ kind: "rejected", sessionId: "s", sequence: 7, code: "rejected" })
    expect(await oldNote).toEqual({
      kind: "rejected",
      sessionId: "s",
      sequence: 7,
      code: "rejected",
    })
    await backend.allNotesOff()
    expect(port.allNotesOff).toHaveBeenLastCalledWith(port.apply.mock.calls[0][1], "s", 8)
    expect(await backend.apply({ ...request(), sessionId: "fresh" })).toMatchObject({
      kind: "rejected",
      code: "protocol",
    })
    expect(port.acquire).toHaveBeenCalledTimes(1)
    expect(port.apply).toHaveBeenCalledTimes(1)
    await backend.allNotesOff()
    expect(port.allNotesOff).toHaveBeenLastCalledWith(port.apply.mock.calls[0][1], "s", 8)
    expect(port.stop).not.toHaveBeenCalled()
    backend.dispose()
    await Promise.resolve()
  })

  it("blocks an old playing open when Stop arrives before admission resolves", async () => {
    const port = audioPort()
    const admitted = deferred<undefined>()
    port.acquire.mockReturnValueOnce(admitted.promise)
    const backend = createNativeProjectBackend(port)
    const opening = backend.apply(request())
    const stopping = backend.urgentStop()
    expect(port.acquire).toHaveBeenCalledTimes(1)
    expect(port.apply).not.toHaveBeenCalled()
    expect(port.stop).not.toHaveBeenCalled()
    admitted.resolve(undefined)
    expect(await opening).toMatchObject({ kind: "rejected", code: "superseded-open" })
    await stopping
    expect(port.apply).not.toHaveBeenCalled()
    expect(port.stop).toHaveBeenCalledWith(port.acquire.mock.calls[0][0], "s", 1)
    const reopened: BackendDocumentRequest = {
      ...request(1),
      controlGeneration: "1",
      state: { ...request().state, control: { ...request().state.control, playing: false } },
    }
    port.apply.mockResolvedValueOnce({
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
      revision: 0,
      controlGeneration: "1",
    })
    expect(await backend.apply(reopened)).toMatchObject({ kind: "accepted", sequence: 1 })
    expect(port.apply).toHaveBeenCalledWith(reopened, port.acquire.mock.calls[0][0], 1)
    backend.dispose()
    await Promise.resolve()
  })

  it("keeps runtime usable after deferred admission Stop and preserves the queued commit", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const admitted = deferred<undefined>()
    const stopped = deferred<undefined>()
    port.acquire.mockReturnValueOnce(admitted.promise)
    port.stop.mockReturnValueOnce(stopped.promise)
    const metadata = z.object({
      sessionId: z.string(),
      sequence: z.number().int().nonnegative(),
      controlGeneration: z.string(),
    })
    let acceptedRevision = 0
    port.apply.mockImplementation(async raw => {
      const parsed = metadata.extend({ revision: z.number().int().nonnegative() }).parse(raw)
      acceptedRevision = parsed.revision
      return { kind: "accepted", ...parsed }
    })
    port.control.mockImplementation(async raw => ({
      kind: "accepted",
      ...metadata.parse(raw),
      revision: acceptedRevision,
    }))
    const store = createStore<ProjectState>(() => ({
      document: initialDocument(DEFAULT_TRACK_HEIGHT),
      workspace: initialWorkspace(),
      session: { ...initialSession(), playing: true },
    }))
    const runtime = createProjectRuntime({
      store,
      defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
      backendFactory: () => createNativeProjectBackend(port),
    })
    const release = runtime.startProjectRuntime()
    try {
      runtime.session({ playing: false })
      runtime.document({
        ...runtime.get().document,
        transport: { ...runtime.get().document.transport, bpm: 133 },
      })
      expect(port.acquire).toHaveBeenCalledTimes(1)
      admitted.resolve(undefined)
      await vi.advanceTimersByTimeAsync(0)
      expect(port.stop).toHaveBeenCalledTimes(1)
      expect(port.apply).not.toHaveBeenCalled()
      stopped.resolve(undefined)
      await runtime.whenProjectBackendIdle()
      expect(port.apply.mock.calls[0][0]).toMatchObject({
        stage: "open",
        sequence: 1,
        state: { control: { playing: false } },
      })
      expect(port.apply.mock.calls.at(-1)?.[0]).toMatchObject({
        stage: "commit",
        revision: 1,
        baseRevision: 0,
        state: { project: { bpm: 133 }, control: { playing: false } },
      })
      expect(runtime.get().document.transport.bpm).toBe(133)
      expect(runtime.get().session.backend.acceptedRevision).toBe(1)
      expect(runtime.canSaveProject()).toBe(true)
      runtime.session({ playing: true })
      await runtime.whenProjectBackendIdle()
      expect(port.control.mock.calls.at(-1)?.[0]).toMatchObject({ control: { playing: true } })
      expect(runtime.get().session.playing).toBe(true)
      expect(runtime.canSaveProject()).toBe(true)
    } finally {
      release()
      await vi.advanceTimersByTimeAsync(0)
    }
  })

  it("holds newer document, Play, and note dispatch behind the captured Stop acknowledgement", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const backend = createNativeProjectBackend(port)
    await backend.apply(request())
    const stopped = deferred<undefined>()
    port.stop.mockReturnValueOnce(stopped.promise)
    const stopping = backend.urgentStop()
    port.apply.mockResolvedValueOnce({
      kind: "accepted",
      sessionId: "s",
      sequence: 2,
      revision: 1,
      controlGeneration: "0",
    })
    const playing = backend.control({
      ...controlRequest(),
      control: { ...controlRequest().control, playing: true },
    })
    const noting = backend.note(noteRequest())
    const committing = backend.apply({ ...request(2), stage: "commit", revision: 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(port.apply).toHaveBeenCalledTimes(1)
    expect(port.control).not.toHaveBeenCalled()
    expect(port.note).not.toHaveBeenCalled()
    stopped.resolve(undefined)
    await stopping
    expect(await playing).toMatchObject({ kind: "accepted" })
    expect(await noting).toMatchObject({ kind: "accepted" })
    expect(await committing).toMatchObject({ kind: "accepted" })
    expect(port.control.mock.calls[0][2]).toBe(1)
    expect(port.note.mock.calls[0][2]).toBe(1)
    expect(port.apply.mock.calls[1][2]).toBe(1)
    backend.dispose()
    await vi.advanceTimersByTimeAsync(0)
  })

  it("propagates a failed Stop barrier instead of dispatching a later Play", async () => {
    const port = audioPort()
    const backend = createNativeProjectBackend(port)
    await backend.apply(request())
    port.stop.mockRejectedValueOnce(new Error("Stop acknowledgement failed"))
    await expect(backend.urgentStop()).rejects.toThrow("Stop acknowledgement failed")
    expect(await backend.control(controlRequest())).toMatchObject({
      kind: "rejected",
      code: "connection",
    })
    expect(await backend.control(controlRequest())).toMatchObject({
      kind: "rejected",
      code: "connection",
    })
    expect(port.control).not.toHaveBeenCalled()
    backend.dispose()
    await Promise.resolve()
  })

  it("holds release behind pending admission and never applies a disposed open", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const admitted = deferred<undefined>()
    port.acquire.mockReturnValueOnce(admitted.promise)
    const stopped = deferred<undefined>()
    port.stop.mockReturnValueOnce(stopped.promise)
    const backend = createNativeProjectBackend(port)
    const opening = backend.apply(request())
    backend.dispose()
    expect(port.apply).not.toHaveBeenCalled()
    expect(port.release).not.toHaveBeenCalled()
    admitted.resolve(undefined)
    expect(await opening).toMatchObject({ kind: "rejected", code: "disposed" })
    await vi.advanceTimersByTimeAsync(0)
    expect(port.apply).not.toHaveBeenCalled()
    expect(port.stop).toHaveBeenCalledWith(port.acquire.mock.calls[0][0], "s", 1)
    expect(port.release).not.toHaveBeenCalled()
    stopped.resolve(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release).toHaveBeenCalledWith(port.acquire.mock.calls[0][0])
  })

  it("reports failed admission and retries it without native document application", async () => {
    const port = audioPort()
    port.acquire.mockRejectedValueOnce(new Error("Admission failed"))
    const backend = createNativeProjectBackend(port)
    expect(await backend.apply(request())).toMatchObject({ kind: "rejected", code: "connection" })
    expect(port.apply).not.toHaveBeenCalled()
    expect(await backend.apply(request())).toMatchObject({ kind: "accepted" })
    expect(port.acquire).toHaveBeenCalledTimes(2)
    expect(port.apply).toHaveBeenCalledTimes(1)
    backend.dispose()
    await Promise.resolve()
  })

  it("rejects source preparation errors after admission without fabricating acceptance", async () => {
    const port = audioPort()
    vi.spyOn(sourceLocations, "resolveBackendSources").mockImplementationOnce(() => {
      throw new Error("Source location is unavailable")
    })
    const backend = createNativeProjectBackend(port)
    expect(await backend.apply(request())).toMatchObject({ kind: "rejected", code: "connection" })
    expect(port.acquire).toHaveBeenCalledTimes(1)
    expect(port.apply).not.toHaveBeenCalled()
    backend.dispose()
    await Promise.resolve()
  })

  it("waits for in-flight control and note before release and drops disposed replies", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const backend = createNativeProjectBackend(port)
    await backend.apply(request())
    const lateControl = deferred<NativePlaybackResult>()
    const lateNote = deferred<NativeNoteResult>()
    port.control.mockReturnValueOnce(lateControl.promise)
    port.note.mockReturnValueOnce(lateNote.promise)
    const controlling = backend.control(controlRequest())
    const noting = backend.note(noteRequest())
    await Promise.resolve()
    backend.dispose()
    expect(port.release).not.toHaveBeenCalled()
    lateControl.resolve({
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
      revision: 0,
      controlGeneration: "1",
    })
    expect(await controlling).toMatchObject({ kind: "rejected", code: "disposed" })
    expect(port.release).not.toHaveBeenCalled()
    lateNote.resolve({ kind: "accepted", sessionId: "s", sequence: 1 })
    expect(await noting).toMatchObject({ kind: "rejected", code: "disposed" })
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release).toHaveBeenCalledTimes(1)
  })
})

describe("native recording publication", () => {
  it("publishes recording previews only for the current session and clears them on release", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const preview = {
      sessionId: "s",
      recordingId: "take",
      tracks: [
        {
          trackId: "track",
          clipId: "clip",
          startBar: 2,
          durationBars: 0.5,
          channels: [{ min: [-0.5], max: [0.25] }],
        },
      ],
    }
    port.telemetry.mockResolvedValue({
      ...snapshot,
      recordingPreview: preview,
    })
    const backend = createNativeProjectBackend(port)
    backend.subscribe(vi.fn())
    await backend.apply(request())
    await vi.advanceTimersByTimeAsync(40)
    expect(readNativeAudioStatus()).toMatchObject({
      recordingPreview: preview,
    })
    port.telemetry.mockResolvedValue({
      ...snapshot,
      recordingPreview: { ...preview, sessionId: "other" },
    })
    await vi.advanceTimersByTimeAsync(40)
    expect(readNativeAudioStatus().recordingPreview).toBeNull()
    backend.dispose()
    expect(readNativeAudioStatus()).toMatchObject({ recordingPreview: null })
  })
  it("keeps telemetry and stop live during commit and retries ACK without recommitting", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    port.recordingResults.mockResolvedValue({ sessionId: "s", recordings: [recording] })
    port.recordingAck.mockRejectedValueOnce(new Error("ACK unavailable"))
    const committed = deferred<{ sessionId: string; revision: number }>()
    const commitRecording = vi.fn(async () => committed.promise)
    const backend = createNativeProjectBackend(port, { commitRecording })
    const unsubscribe = backend.subscribe(vi.fn())
    await backend.apply(request())
    await vi.advanceTimersByTimeAsync(150)
    expect(commitRecording).toHaveBeenCalledTimes(1)
    expect(port.telemetry.mock.calls.length).toBeGreaterThan(2)
    expect(port.recordingAck).not.toHaveBeenCalled()
    await backend.urgentStop()
    expect(port.stop).toHaveBeenCalledTimes(1)
    expect(await backend.control(controlRequest())).toMatchObject({ kind: "accepted" })
    committed.resolve({ sessionId: "s", revision: 3 })
    await vi.advanceTimersByTimeAsync(0)
    expect(port.recordingAck).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(commitRecording).toHaveBeenCalledTimes(1)
    expect(port.recordingAck).toHaveBeenCalledTimes(2)
    expect(port.recordingAck).toHaveBeenLastCalledWith(
      port.apply.mock.calls[0][1],
      "s",
      "recording-1",
      3
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(port.recordingAck).toHaveBeenCalledTimes(2)
    unsubscribe()
    backend.dispose()
  })

  it("rejects foreign results and isolates result-fetch failures from telemetry", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    port.recordingResults
      .mockRejectedValueOnce(new Error("inspection failed"))
      .mockResolvedValue({ sessionId: "other", recordings: [{ ...recording, sessionId: "other" }] })
    const commitRecording = vi.fn(async () => ({ sessionId: "s", revision: 2 }))
    const backend = createNativeProjectBackend(port, { commitRecording })
    const listener = vi.fn()
    const unsubscribe = backend.subscribe(listener)
    await backend.apply(request())
    await vi.advanceTimersByTimeAsync(120)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(port.telemetry.mock.calls.length).toBeGreaterThan(1)
    expect(commitRecording).not.toHaveBeenCalled()
    expect(port.recordingAck).not.toHaveBeenCalled()
    unsubscribe()
    backend.dispose()
  })

  it("does not ACK a receipt from another session", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    port.recordingResults.mockResolvedValue({ sessionId: "s", recordings: [recording] })
    const backend = createNativeProjectBackend(port, {
      commitRecording: async () => ({ sessionId: "other", revision: 2 }),
    })
    const unsubscribe = backend.subscribe(vi.fn())
    await backend.apply(request())
    await vi.advanceTimersByTimeAsync(40)
    expect(port.recordingAck).not.toHaveBeenCalled()
    unsubscribe()
    backend.dispose()
  })

  it("releases without awaiting an outstanding commit and never ACKs its late reply", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    port.recordingResults.mockResolvedValue({ sessionId: "s", recordings: [recording] })
    const committed = deferred<{ sessionId: string; revision: number }>()
    const backend = createNativeProjectBackend(port, { commitRecording: () => committed.promise })
    backend.subscribe(vi.fn())
    await backend.apply(request())
    await vi.advanceTimersByTimeAsync(40)
    backend.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(port.release).toHaveBeenCalledTimes(1)
    committed.resolve({ sessionId: "s", revision: 2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(port.recordingAck).not.toHaveBeenCalled()
  })

  it("keeps transport observations flowing while one recording fetch is outstanding", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const fetched = deferred<NativeRecordingResults>()
    port.recordingResults.mockReturnValue(fetched.promise)
    const backend = createNativeProjectBackend(port, {
      commitRecording: async () => ({ sessionId: "s", revision: 2 }),
    })
    backend.subscribe(vi.fn())
    await backend.apply(request())
    await vi.advanceTimersByTimeAsync(150)
    expect(port.recordingResults).toHaveBeenCalledTimes(1)
    expect(port.telemetry.mock.calls.length).toBeGreaterThan(2)
    fetched.resolve({ sessionId: "s", recordings: [] })
    await vi.advanceTimersByTimeAsync(40)
    expect(port.recordingResults).toHaveBeenCalledTimes(2)
    backend.dispose()
  })
})

describe("native Browser audition", () => {
  it("reserves from the retained native owner after the WebView module reloads", async () => {
    const port = audioPort(500)
    const first = createNativeBrowserAuditionPort(port)
    await first.select("/before-reload.wav")
    vi.resetModules()
    // A static import cannot recreate the WebView's discarded module state.
    const reloaded = await import("./native")
    const second = reloaded.createNativeBrowserAuditionPort(port)
    await second.select("/after-reload.wav")
    expect(port.audition.mock.calls.map(([request]) => request.generation)).toEqual([501, 502])
    expect(port.reserveAudition).toHaveBeenCalledTimes(2)
  })

  it("does not let an older reservation response replace the latest selection", async () => {
    const port = audioPort(1)
    const firstReservation = deferred<number>()
    port.reserveAudition.mockReturnValueOnce(firstReservation.promise)
    const audition = createNativeBrowserAuditionPort(port)
    const first = audition.select("/first.wav").catch(error => error)
    await audition.select("/latest.wav")
    firstReservation.resolve(1)
    expect(await first).toMatchObject({ name: "AbortError" })
    expect(port.audition).toHaveBeenCalledTimes(1)
    expect(port.audition).toHaveBeenCalledWith({
      generation: 2,
      path: "/latest.wav",
      mode: "raw",
      gainDb: -18,
    })
    expect(await audition.read()).toMatchObject({ playing: true })
  })

  it("cancels selection before reservation resolves and reserves a native stop fence", async () => {
    const port = audioPort(1)
    const reservation = deferred<number>()
    port.reserveAudition.mockReturnValueOnce(reservation.promise)
    const audition = createNativeBrowserAuditionPort(port)
    const selecting = audition.select("/pending-reservation.wav").catch(error => error)
    const stopping = audition.stop()
    expect(port.reserveAudition).toHaveBeenCalledTimes(1)
    reservation.resolve(1)
    await stopping
    expect(await selecting).toMatchObject({ name: "AbortError" })
    expect(port.reserveAudition).toHaveBeenCalledTimes(2)
    expect(port.stopAudition).toHaveBeenCalledWith(2)
    expect(port.audition).not.toHaveBeenCalled()
    expect(await audition.read()).toMatchObject({ playing: false })
  })

  it("orders a replacement selection after an already pending stop reservation", async () => {
    const port = audioPort()
    const pendingAudition = deferred<NativeAuditionResult>()
    const stopReservation = deferred<number>()
    const stopReserving = deferred<undefined>()
    port.audition.mockReturnValueOnce(pendingAudition.promise)
    port.reserveAudition
      .mockResolvedValueOnce(1)
      .mockImplementationOnce(() => {
        stopReserving.resolve(undefined)
        return stopReservation.promise
      })
      .mockResolvedValueOnce(3)
    const old = createNativeBrowserAuditionPort(port)
    const current = createNativeBrowserAuditionPort(port)
    const selecting = old.select("/old.wav").catch(error => error)
    await Promise.resolve()
    const stopping = old.stop()
    await stopReserving.promise
    const replacement = current.select("/replacement.wav")
    expect(port.reserveAudition).toHaveBeenCalledTimes(2)
    stopReservation.resolve(2)
    await stopping
    await replacement
    pendingAudition.resolve({ generation: 1, durationSeconds: 3, state: "playing" })
    expect(await selecting).toMatchObject({ name: "AbortError" })
    expect(port.audition.mock.calls.map(([request]) => request.generation)).toEqual([1, 3])
    await old.stop()
    expect(port.stopAudition).not.toHaveBeenCalled()
    expect(await current.read()).toMatchObject({ playing: true })
  })

  it("does not let a pending old port stop reserve over its replacement", async () => {
    const port = audioPort(1)
    const reservation = deferred<number>()
    port.reserveAudition.mockReturnValueOnce(reservation.promise)
    const old = createNativeBrowserAuditionPort(port)
    const current = createNativeBrowserAuditionPort(port)
    const selecting = old.select("/old.wav").catch(error => error)
    const stopping = old.stop()
    const replacement = current.select("/replacement.wav")
    reservation.resolve(1)
    await stopping
    await replacement
    expect(await selecting).toMatchObject({ name: "AbortError" })
    expect(port.reserveAudition).toHaveBeenCalledTimes(2)
    expect(port.stopAudition).not.toHaveBeenCalled()
    expect(port.audition.mock.calls.map(([request]) => request.generation)).toEqual([2])
  })

  it("always selects original-speed audio and reads native source time; newest selection wins", async () => {
    const port = audioPort()
    const first = deferred<NativeAuditionResult>()
    port.audition.mockReturnValueOnce(first.promise)
    const audition = createNativeBrowserAuditionPort(port)
    const stale = audition.select("/first.wav").catch(error => error)
    await Promise.resolve()
    await audition.select("/second.wav")
    const oldGeneration = port.audition.mock.calls[0][0].generation
    const currentGeneration = port.audition.mock.calls[1][0].generation
    expect(currentGeneration).toBeGreaterThan(oldGeneration)
    expect(port.audition.mock.calls[1][0]).toEqual({
      generation: currentGeneration,
      path: "/second.wav",
      mode: "raw",
      gainDb: -18,
    })
    expect(port.analyzeTempo).not.toHaveBeenCalled()
    first.resolve({ generation: oldGeneration, durationSeconds: 2, state: "playing" })
    expect(await stale).toMatchObject({ name: "AbortError" })
    expect(await audition.read()).toEqual({
      positionSeconds: 1.25,
      durationSeconds: 3,
      playing: true,
    })
    await audition.stop()
    expect(port.stopAudition).toHaveBeenCalledWith(currentGeneration)
    await audition.seek(0.75)
    expect(port.seekAudition).toHaveBeenCalledWith(currentGeneration, 0.75)
  })

  it("fences a stopped pending selection and rejects seek before a successful select", async () => {
    const port = audioPort()
    const pending = deferred<NativeAuditionResult>()
    port.audition.mockReturnValueOnce(pending.promise)
    const audition = createNativeBrowserAuditionPort(port)
    const selecting = audition.select("/raw.wav").catch(error => error)
    await Promise.resolve()
    const generation = port.audition.mock.calls[0][0].generation
    await expect(audition.seek(0.5)).rejects.toThrow("Select a preview source")
    await audition.stop()
    expect(port.stopAudition.mock.calls[0][0]).toBeGreaterThan(generation)
    pending.resolve({ generation, durationSeconds: 2, state: "playing" })
    expect(await selecting).toMatchObject({ name: "AbortError" })
    expect(await audition.read()).toEqual({
      positionSeconds: 0,
      durationSeconds: 0,
      playing: false,
    })
    expect(port.seekAudition).not.toHaveBeenCalled()
  })

  it("rejects late status after replacement, stop, and seek, and exposes command errors", async () => {
    const port = audioPort()
    const audition = createNativeBrowserAuditionPort(port)
    await audition.select("/first.wav")
    for (const action of [
      () => audition.select("/next.wav"),
      () => audition.stop(),
      () => audition.seek(0.5),
    ]) {
      const pending = deferred<NativeAuditionStatus>()
      port.auditionStatus.mockReturnValueOnce(pending.promise)
      const reading = audition.read().catch(error => error)
      const generation = port.auditionStatus.mock.lastCall![0]
      await action()
      pending.resolve({ generation, positionSeconds: 2, durationSeconds: 3, playing: true })
      expect(await reading).toMatchObject({ name: "AbortError" })
    }
    port.auditionStatus.mockRejectedValueOnce(new Error("Device disconnected"))
    await expect(audition.read()).rejects.toThrow("Device disconnected")
    port.audition.mockRejectedValueOnce(new Error("Audition file is offline"))
    await expect(audition.select("/missing.wav")).rejects.toThrow("offline")
  })

  it("does not let an obsolete adapter stop a newer preview selection", async () => {
    const port = audioPort()
    const old = createNativeBrowserAuditionPort(port)
    const current = createNativeBrowserAuditionPort(port)
    await old.select("/old.wav")
    await current.select("/current.wav")
    await old.stop()
    expect(port.stopAudition).not.toHaveBeenCalled()
    expect(await current.read()).toMatchObject({ playing: true, positionSeconds: 1.25 })
  })
})
