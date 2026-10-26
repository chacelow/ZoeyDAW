import { vi } from "vitest"
import type {
  AudioDeviceSnapshot,
  NativeAudioPort,
  NativeRecording,
  PlaybackSnapshot,
} from "@/shared/native/audio"
import type {
  BackendControlRequest,
  BackendDocumentRequest,
  BackendNoteRequest,
} from "@zoeydaw/project-core/backend"
import {
  createNativeProjectBackend,
  type NativeProjectBackend,
  type NativeProjectBackendOptions,
} from "./native"
import type { MeterSessionPort } from "@zoeydaw/project-runtime/realtime"
import type { RealtimeRegistry } from "@zoeydaw/project-core/realtime"

export const device: AudioDeviceSnapshot = {
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
export const snapshot: PlaybackSnapshot = { device, issues: [], pluginFaults: [], meterReady: true }
export const recording: NativeRecording = {
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
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
export function audioPort(generation = 0) {
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
export function request(sequence = 0): BackendDocumentRequest {
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
export function controlRequest(): BackendControlRequest {
  return {
    protocolVersion: 2,
    sessionId: "s",
    sequence: 1,
    controlGeneration: "1",
    control: { playing: false, recording: false, seekBar: 3, seekGeneration: 1 },
  }
}
export function noteRequest(): BackendNoteRequest {
  return {
    protocolVersion: 2,
    sessionId: "s",
    sequence: 1,
    note: { trackId: "t", noteId: "key-1", pitch: 60, velocity: 100, on: true },
  }
}

export function meterPort(): MeterSessionPort {
  const registry: RealtimeRegistry = {
    sessionId: "s",
    sessionEpoch: 1,
    deviceEpoch: 1,
    generation: 1,
    registryRevision: 1,
    resetEpoch: 0,
    entries: [],
    sources: [],
    endpointResets: [],
  }
  return {
    open: async () => ({ streamId: 7, registry }),
    registry: async () => registry,
    clock: async () => null,
    interest: async () => {},
    snapshot: async () => new ArrayBuffer(0),
    receipt: async () => {},
    reset: async () => ({ resetEpoch: 0, affected: [] }),
    close: async () => {},
  }
}

export function createBackend(
  port: NativeAudioPort,
  options: NativeProjectBackendOptions = {}
): NativeProjectBackend {
  return createNativeProjectBackend(port, { meters: meterPort(), ...options })
}
