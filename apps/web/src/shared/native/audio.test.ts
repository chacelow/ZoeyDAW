import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  cancelNativeWaveformRanges,
  nativeAudio,
  readNativeWaveform,
  readNativeWaveformRange,
} from "./audio"
import type { BackendDocumentRequest } from "@zoeydaw/project-core/backend"
import { waveformRangeRequestSchema } from "@zoeydaw/project-core/waveform-range"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }))
const device = {
  state: "ready",
  host: "CoreAudio",
  deviceId: "out",
  deviceName: "Output",
  sampleRate: 44100,
  bufferFrames: 512,
  outputChannels: 2,
  devices: [{ id: "out", name: "Output", host: "CoreAudio", inputChannels: 0, outputChannels: 2 }],
  hosts: [{ id: "CoreAudio", name: "CoreAudio", separateInputOutput: true, controlPanel: false }],
  inputDevices: [],
  outputDevices: [
    { id: "out", name: "Output", host: "CoreAudio", inputChannels: 0, outputChannels: 2 },
  ],
  configuration: {
    host: "CoreAudio",
    inputDeviceId: null,
    outputDeviceId: "out",
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
    outputDeviceId: "out",
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
beforeEach(() => {
  vi.mocked(invoke).mockReset()
  vi.mocked(isTauri).mockReturnValue(true)
})

describe("native audio IPC boundary", () => {
  it("validates real input readings and bounded signed recording extrema", async () => {
    const preview = {
      sessionId: "s",
      recordingId: "take",
      tracks: [
        {
          trackId: "track",
          clipId: "clip",
          startBar: 2,
          durationBars: 0.5,
          channels: [{ min: [-0.5, -0.1], max: [0.2, 0.7] }],
        },
      ],
    }
    const snapshot = {
      device,
      meterReady: false,
      issues: [],
      recordingPreview: preview,
    }
    vi.mocked(invoke).mockResolvedValueOnce(snapshot)
    expect(await nativeAudio.telemetry("lease")).toEqual(snapshot)
    for (const channels of [
      [{ min: [-0.5], max: [] }],
      [{ min: Array(513).fill(0), max: Array(513).fill(0) }],
      [{ min: [NaN], max: [1] }],
    ]) {
      vi.mocked(invoke).mockResolvedValueOnce({
        ...snapshot,
        recordingPreview: { ...preview, tracks: [{ ...preview.tracks[0], channels }] },
      })
      await expect(nativeAudio.telemetry("lease")).rejects.toThrow()
    }
  })
  it("admits a playback lease through the explicit command and validates its response", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await nativeAudio.acquire("lease", "s")
    expect(invoke).toHaveBeenCalledWith("playback_acquire", { leaseId: "lease", sessionId: "s" })
    vi.mocked(invoke).mockResolvedValueOnce({ accepted: true })
    await expect(nativeAudio.acquire("lease", "s")).rejects.toThrow()
  })

  it("validates inspected recordings and routes owner-bound acknowledgement", async () => {
    const source = {
      id: "file-1",
      name: "take.wav",
      sha256: "a".repeat(64),
      byteLength: 192044,
      sampleRate: 48000,
      frames: 48000,
      channels: 2,
      location: { kind: "external", path: "/recordings/take.wav" },
    }
    const recording = {
      recordingId: "take-1",
      sessionId: "s",
      sourceBpm: 120,
      sources: [source],
      clips: [
        {
          clipId: "clip-1",
          fileId: "file-1",
          trackId: "track-1",
          startBar: 1,
          durationBars: 0.5,
          sourceOffsetBars: 0,
        },
      ],
    }
    const result = { sessionId: "s", recordings: [recording] }
    vi.mocked(invoke).mockResolvedValueOnce(result)
    expect(await nativeAudio.recordingResults("lease", "s")).toEqual(result)
    expect(invoke).toHaveBeenLastCalledWith("recording_results", {
      leaseId: "lease",
      sessionId: "s",
    })
    for (const invalid of [
      { ...recording, sessionId: "other" },
      { ...recording, sources: [{ ...source, frames: 0 }] },
      { ...recording, sources: [{ ...source, sha256: "unverified" }] },
      {
        ...recording,
        sources: [{ ...source, location: { kind: "fixture", uri: "mock://take.wav" } }],
      },
      { ...recording, clips: [{ ...recording.clips[0], fileId: "missing" }] },
      { ...recording, clips: [recording.clips[0], recording.clips[0]] },
    ]) {
      vi.mocked(invoke).mockResolvedValueOnce({ sessionId: "s", recordings: [invalid] })
      await expect(nativeAudio.recordingResults("lease", "s")).rejects.toThrow()
    }
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await nativeAudio.recordingAck("lease", "s", "take-1", 7)
    expect(invoke).toHaveBeenLastCalledWith("recording_ack", {
      leaseId: "lease",
      sessionId: "s",
      recordingId: "take-1",
      acceptedRevision: 7,
    })
    expect(() => nativeAudio.recordingAck("lease", "s", "take-1", -1)).toThrow()
    vi.mocked(invoke).mockResolvedValueOnce({ accepted: true })
    await expect(nativeAudio.recordingAck("lease", "s", "take-1", 7)).rejects.toThrow()
  })

  it("routes all-notes-off without invoking transport stop and validates void replies", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await nativeAudio.allNotesOff("lease", "s", 7)
    expect(invoke).toHaveBeenCalledWith("playback_all_notes_off", {
      leaseId: "lease",
      sessionId: "s",
      throughSequence: 7,
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    vi.mocked(invoke).mockResolvedValueOnce({ accepted: true })
    await expect(nativeAudio.allNotesOff("lease", "s", 7)).rejects.toThrow()
    const calls = vi.mocked(invoke).mock.calls.length
    for (const cutoff of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])
      expect(() => nativeAudio.allNotesOff("lease", "s", cutoff)).toThrow()
    expect(invoke).toHaveBeenCalledTimes(calls)
  })

  it("reads actual device values and rejects unknown fields and nonfinite configuration", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(device)
    expect(await nativeAudio.devices()).toEqual(device)
    vi.mocked(invoke).mockResolvedValueOnce({ ...device, syntheticCpu: 12 })
    await expect(nativeAudio.devices()).rejects.toThrow()
    vi.mocked(invoke).mockResolvedValueOnce({ ...device, sampleRate: Number.NaN })
    await expect(nativeAudio.devices()).rejects.toThrow()
    await expect(
      nativeAudio.configureDevice({ ...device.configuration, bufferFrames: -1 })
    ).rejects.toThrow()
    expect(invoke).toHaveBeenCalledTimes(3)
  })

  it("keeps status separate from binary transport and rejects legacy clock and meter payloads", async () => {
    const status = { device, issues: [], meterReady: true }
    vi.mocked(invoke).mockResolvedValueOnce(status)
    expect(await nativeAudio.telemetry("lease")).toEqual(status)
    for (const extra of [{ telemetry: { clock: { bar: 1 } } }, { levels: { main: [-30] } }]) {
      vi.mocked(invoke).mockResolvedValueOnce({ ...status, ...extra })
      await expect(nativeAudio.telemetry("lease")).rejects.toThrow()
    }
  })

  it("sends stop epochs outside the immutable document and validates replies", async () => {
    const request: BackendDocumentRequest = {
      protocolVersion: 2,
      sessionId: "s",
      sequence: 0,
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
          playing: false,
          recording: false,
          seekBar: 1,
          seekGeneration: 0,
        },
      },
    }
    vi.mocked(invoke).mockResolvedValueOnce({
      kind: "accepted",
      sessionId: "s",
      sequence: 0,
      revision: 0,
      controlGeneration: "0",
    })
    await nativeAudio.apply(request, "lease", 3)
    expect(invoke).toHaveBeenCalledWith("playback_apply", {
      request,
      leaseId: "lease",
      stopToken: 3,
    })
    vi.mocked(invoke).mockResolvedValueOnce({
      kind: "accepted",
      sessionId: "s",
      sequence: 0,
      revision: 0,
      controlGeneration: "0",
      extra: true,
    })
    await expect(nativeAudio.apply(request, "lease", 3)).rejects.toThrow()
  })

  it("sends narrow controls and rejects malformed accepted and rejected responses", async () => {
    const request = {
      protocolVersion: 2,
      sessionId: "s",
      sequence: 1,
      controlGeneration: "9007199254740993",
      control: { playing: true, recording: false, seekBar: 1, seekGeneration: 0 },
    }
    const accepted = {
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
      revision: 0,
      controlGeneration: request.controlGeneration,
    }
    vi.mocked(invoke).mockResolvedValueOnce(accepted)
    expect(await nativeAudio.control(request, "lease", 3)).toEqual(accepted)
    expect(invoke).toHaveBeenLastCalledWith("playback_control", {
      request,
      leaseId: "lease",
      stopToken: 3,
    })
    const rejected = {
      kind: "rejected",
      sessionId: "s",
      sequence: 1,
      code: "rejected",
      controlGeneration: request.controlGeneration,
    }
    vi.mocked(invoke).mockResolvedValueOnce(rejected)
    expect(await nativeAudio.control(request, "lease", 3)).toEqual(rejected)
    for (const malformed of [
      { ...accepted, controlGeneration: 1 },
      { ...accepted, controlGeneration: "18446744073709551616" },
      { ...accepted, controlGeneration: "01" },
      { ...rejected, code: "note-overrun" },
      { ...rejected, controlGeneration: undefined },
      { ...rejected, extra: true },
    ]) {
      vi.mocked(invoke).mockResolvedValueOnce(malformed)
      await expect(nativeAudio.control(request, "lease", 3)).rejects.toThrow()
    }
    const before = vi.mocked(invoke).mock.calls.length
    await expect(nativeAudio.control({ ...request, project: {} }, "lease", 3)).rejects.toThrow()
    expect(invoke).toHaveBeenCalledTimes(before)
  })

  it("keeps reliable note replies distinct and validates note edges before invocation", async () => {
    const request = {
      protocolVersion: 2,
      sessionId: "s",
      sequence: 9,
      note: {
        trackId: "t",
        noteId: "key-1",
        pitch: 60,
        velocity: 100,
        on: true,
        requestedSample: "9007199254740993",
      },
    }
    const accepted = { kind: "accepted", sessionId: "s", sequence: 9 }
    vi.mocked(invoke).mockResolvedValueOnce(accepted)
    expect(await nativeAudio.note(request, "lease", 2)).toEqual(accepted)
    expect(invoke).toHaveBeenLastCalledWith("playback_note", {
      request,
      leaseId: "lease",
      stopToken: 2,
    })
    const rejected = { kind: "rejected", sessionId: "s", sequence: 9, code: "note-overrun" }
    vi.mocked(invoke).mockResolvedValueOnce(rejected)
    expect(await nativeAudio.note(request, "lease", 2)).toEqual(rejected)
    for (const malformed of [
      { ...accepted, revision: 0 },
      { ...rejected, code: "unknown" },
      { ...accepted, sequence: 0 },
      { ...rejected, sequence: 0 },
    ]) {
      vi.mocked(invoke).mockResolvedValueOnce(malformed)
      await expect(nativeAudio.note(request, "lease", 2)).rejects.toThrow()
    }
    const before = vi.mocked(invoke).mock.calls.length
    await expect(nativeAudio.note({ ...request, sequence: 0 }, "lease", 2)).rejects.toThrow()
    for (const note of [
      { ...request.note, pitch: 128 },
      { ...request.note, velocity: -1 },
      { ...request.note, requestedSample: "-1" },
    ])
      await expect(nativeAudio.note({ ...request, note }, "lease", 2)).rejects.toThrow()
    expect(invoke).toHaveBeenCalledTimes(before)
  })

  it("does not invoke native commands in a web-only environment", async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    await expect(nativeAudio.devices()).rejects.toThrow("unavailable")
    expect(invoke).not.toHaveBeenCalled()
  })

  it("rejects unknown audition tempo and invalid seek/waveform values at the boundary", async () => {
    await expect(
      nativeAudio.audition({
        generation: 1,
        path: "/sample.wav",
        mode: "sync",
        sourceBpm: null,
        projectBpm: 140,
        numerator: 4,
        denominator: 4,
        gainDb: -18,
      })
    ).rejects.toThrow()
    expect(() => nativeAudio.seekAudition(1, 2)).toThrow()
    vi.mocked(invoke).mockResolvedValueOnce({ durationSeconds: 1, peaks: [0.2, 1.5] })
    await expect(readNativeWaveform("/sample.wav")).rejects.toThrow()
  })

  it("reads signed consecutive stereo samples without clipping finite over-unity values", async () => {
    const request = {
      path: "/float.wav",
      startFrame: 10,
      frameCount: 4,
      columns: 2,
      framesPerBin: 1,
    }
    const response = {
      kind: "samples",
      sampleRate: 48000,
      totalFrames: 20,
      startFrame: 10,
      frameCount: 4,
      channels: [
        [1.5, -1.25, 0.5, -0.75],
        [-0.25, 0.75, -0.5, 0.125],
      ],
    }
    vi.mocked(invoke).mockResolvedValueOnce(response)
    expect(await readNativeWaveformRange(request)).toEqual(response)
    expect(invoke).toHaveBeenCalledWith("playback_waveform_range", { request })
  })

  it("validates signed extrema against aligned binary source bins", async () => {
    const request = {
      path: "/float.wav",
      startFrame: 0,
      frameCount: 20,
      columns: 2,
      framesPerBin: 16,
    }
    const response = {
      kind: "envelope",
      sampleRate: 48000,
      totalFrames: 20,
      startFrame: 0,
      frameCount: 20,
      framesPerBin: 16,
      channels: [{ min: [-1.5, 0.25], max: [-0.25, 1.75] }],
    }
    vi.mocked(invoke).mockResolvedValueOnce(response)
    expect(await readNativeWaveformRange(request)).toEqual(response)
    for (const channels of [
      [{ min: [-1], max: [1] }],
      [{ min: [-1, -0.5], max: [1] }],
      [{ min: [1, -0.5], max: [-1, 0.5] }],
      [{ min: [-1, Number.NEGATIVE_INFINITY], max: [1, 0.5] }],
    ]) {
      vi.mocked(invoke).mockResolvedValueOnce({ ...response, channels })
      await expect(readNativeWaveformRange(request)).rejects.toThrow()
    }
  })

  it("uses the clamped frame count to select samples at the source end", async () => {
    const request = {
      path: "/float.wav",
      startFrame: 18,
      frameCount: Number.MAX_SAFE_INTEGER,
      columns: 1,
      framesPerBin: 1,
    }
    const response = {
      kind: "samples",
      sampleRate: 48000,
      totalFrames: 20,
      startFrame: 18,
      frameCount: 2,
      channels: [[-0.5, 1.25]],
    }
    vi.mocked(invoke).mockResolvedValueOnce(response)
    expect(await readNativeWaveformRange(request)).toEqual(response)
    for (const malformed of [
      { ...response, frameCount: 3, channels: [[-0.5, 1.25, 0]] },
      { ...response, startFrame: 17 },
      { ...response, totalFrames: Number.MAX_SAFE_INTEGER + 1 },
      { ...response, totalFrames: 18 },
      { ...response, channels: [[-0.5]] },
      { ...response, channels: [[-0.5, Number.NaN]] },
      { ...response, channels: Array.from({ length: 65 }, () => [-0.5, 1.25]) },
      { ...response, invented: true },
      { ...response, kind: "envelope", channels: [{ min: [-0.5], max: [1.25] }] },
    ]) {
      vi.mocked(invoke).mockResolvedValueOnce(malformed)
      await expect(readNativeWaveformRange(request)).rejects.toThrow()
    }
  })

  it("rejects unsafe or malformed range requests before invoking native code", async () => {
    const request = {
      path: "/float.wav",
      startFrame: 0,
      frameCount: 4,
      columns: 2,
      framesPerBin: 1,
    }
    for (const invalid of [
      { ...request, path: "" },
      { ...request, path: "/bad\0.wav" },
      { ...request, startFrame: -1 },
      { ...request, startFrame: Number.MAX_SAFE_INTEGER + 1 },
      { ...request, frameCount: 0 },
      { ...request, frameCount: Number.MAX_SAFE_INTEGER + 1 },
      { ...request, frameCount: 1.5 },
      { ...request, columns: 0 },
      { ...request, columns: 4097 },
      { ...request, framesPerBin: 0 },
      { ...request, framesPerBin: 3 },
      { ...request, framesPerBin: 2, startFrame: 1 },
      { ...request, invented: true },
    ])
      await expect(readNativeWaveformRange(invalid)).rejects.toThrow()
    expect(
      waveformRangeRequestSchema.safeParse({
        path: request.path,
        startFrame: 0,
        frameCount: 4,
        columns: 2,
      }).success
    ).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  it("cancels only the range decoder through its dedicated command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await cancelNativeWaveformRanges()
    expect(invoke).toHaveBeenCalledExactlyOnceWith("playback_waveform_range_cancel", {})
  })

  it("reserves native-owned positive safe audition generations", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(4097)
    expect(await nativeAudio.reserveAudition()).toBe(4097)
    expect(invoke).toHaveBeenCalledWith("playback_audition_reserve", undefined)
    for (const generation of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "4098"]) {
      vi.mocked(invoke).mockResolvedValueOnce(generation)
      await expect(nativeAudio.reserveAudition()).rejects.toThrow()
    }
  })

  it("validates actual preview status and generation arguments", async () => {
    const status = { generation: 7, positionSeconds: 1.5, durationSeconds: 3, playing: false }
    vi.mocked(invoke).mockResolvedValueOnce(status)
    expect(await nativeAudio.auditionStatus(7)).toEqual(status)
    expect(invoke).toHaveBeenCalledWith("playback_audition_status", { generation: 7 })
    vi.mocked(invoke).mockResolvedValueOnce({ ...status, positionSeconds: Number.NaN })
    await expect(nativeAudio.auditionStatus(7)).rejects.toThrow()
    await expect(nativeAudio.auditionStatus(-1)).rejects.toThrow()
  })

  it("analyzes only a file path, preserves unknown, and rejects invented or malformed BPM", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ bpm: 120, origin: "analysis" })
    expect(await nativeAudio.analyzeTempo("/loop.wav")).toEqual({ bpm: 120, origin: "analysis" })
    expect(invoke).toHaveBeenCalledWith("playback_analyze_tempo", { path: "/loop.wav" })
    vi.mocked(invoke).mockResolvedValueOnce({ bpm: 128, origin: "metadata" })
    expect(await nativeAudio.analyzeTempo("/tagged.wav")).toEqual({ bpm: 128, origin: "metadata" })
    vi.mocked(invoke).mockResolvedValueOnce({ bpm: null, origin: "unknown" })
    expect(await nativeAudio.analyzeTempo("/tone.wav")).toEqual({ bpm: null, origin: "unknown" })
    for (const malformed of [
      { bpm: 120, origin: "unknown" },
      { bpm: null, origin: "analysis" },
      { bpm: Number.NaN, origin: "metadata" },
    ]) {
      vi.mocked(invoke).mockResolvedValueOnce(malformed)
      await expect(nativeAudio.analyzeTempo("/bad.wav")).rejects.toThrow()
    }
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Tempo source is offline"))
    await expect(nativeAudio.analyzeTempo("/missing.wav")).rejects.toThrow("offline")
    await expect(nativeAudio.analyzeTempo("")).rejects.toThrow()
  })

  it("sends raw preview without project tempo or fixed source BPM", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ generation: 1, durationSeconds: 3, state: "playing" })
    const request = {
      generation: 1,
      path: "/sample.wav",
      mode: "raw",
      gainDb: -18,
    } satisfies Parameters<typeof nativeAudio.audition>[0]
    await nativeAudio.audition(request)
    expect(invoke).toHaveBeenCalledWith("playback_audition", { request })
  })
})
