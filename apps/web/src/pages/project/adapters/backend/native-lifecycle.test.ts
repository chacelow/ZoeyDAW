// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import logger from "@zoeymind/logger"
import {
  readNativeAudioStatus,
  type PlaybackSnapshot,
  type NativeNoteResult,
} from "@/shared/native/audio"
import type { BackendResult } from "@zoeydaw/project-core/backend"
import * as sourceLocations from "./source-locations"
import * as waveforms from "./waveforms"
import type { MeterSessionPort } from "@zoeydaw/project-runtime/realtime"
import type { RealtimeStreamOpenResult } from "@zoeydaw/project-core/realtime"
import { readProjectMeters } from "../realtime"
import {
  createBackend,
  audioPort,
  device,
  snapshot,
  deferred,
  request,
  controlRequest,
  noteRequest,
} from "./native.testing"
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("native project backend", () => {
  it("does not acquire on import/factory/subscription and releases only its lease once", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const backend = createBackend(port)
    const unsubscribe = backend.subscribe(vi.fn())
    expect(port.apply).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    backend.dispose()
    unsubscribe()
    expect(port.release).not.toHaveBeenCalled()
    const first = createBackend(port)
    const second = createBackend(port)
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
    const backend = createBackend(port, { meters: meterPort })
    port.telemetry.mockResolvedValueOnce({ ...snapshot, meterReady: false })
    await backend.apply(request())
    expect(readProjectMeters()).not.toBeNull()
    const unsubscribe = backend.subscribe(vi.fn())
    expect(meterPort.open).toHaveBeenCalledOnce()
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
    const backend = createBackend(port)
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
    const backend = createBackend(port)
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
      const backend = createBackend(port)
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

  it("polls status only for an active subscribed lease and never turns it into transport", async () => {
    vi.useFakeTimers()
    const port = audioPort()
    const late = deferred<PlaybackSnapshot>()
    port.telemetry.mockReturnValueOnce(late.promise)
    const backend = createBackend(port)
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
    const fault: PlaybackSnapshot["pluginFaults"][number] = {
      sessionId: request().sessionId,
      trackId: "track",
      deviceId: "device",
      instanceId: "1",
      helperProcessId: 100,
      kind: "hang",
      code: "plugin-hang",
      message: "Blocked helper",
      recoverable: true,
    }
    port.telemetry.mockResolvedValueOnce({
      ...snapshot,
      pluginFaults: [fault, { ...fault, sessionId: "foreign" }],
    })
    const cleanup = backend.subscribe(listener)
    await vi.advanceTimersByTimeAsync(34)
    expect(listener).not.toHaveBeenCalled()
    expect(readNativeAudioStatus().device).toEqual(device)
    expect(readNativeAudioStatus().pluginFaults).toEqual([fault])
    cleanup()
    backend.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(readNativeAudioStatus().pluginFaults).toEqual([])
  })

  it("explicitly rejects browser playback instead of silently using a mock engine", async () => {
    const port = audioPort()
    port.available = () => false
    const backend = createBackend(port)
    expect(await backend.apply(request())).toMatchObject({ kind: "rejected", code: "connection" })
    expect(port.apply).not.toHaveBeenCalled()
    backend.dispose()
  })

  it("dispatches control and note without source resolution or waveform prewarming", async () => {
    const sources = vi.spyOn(sourceLocations, "resolveBackendSources")
    const warm = vi.spyOn(waveforms, "prepareNativeWaveforms").mockResolvedValue(undefined)
    const port = audioPort()
    const backend = createBackend(port)
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
    const backend = createBackend(port)
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
    const backend = createBackend(port)
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
    const backend = createBackend(port)
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
})
