// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { readNativeAudioStatus, type NativeRecordingResults } from "@/shared/native/audio"
import * as nativeAudio from "@/shared/native/audio"
import {
  createBackend,
  audioPort,
  deferred,
  request,
  controlRequest,
  snapshot,
  recording,
} from "./native.testing"
import { audioFrame, transportFixture } from "./native-transport.testing"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
describe("native recording publication", () => {
  it("waits for recovered take publication and refuses a late reclaim after disposal", async () => {
    const port = audioPort()
    const claim = vi.spyOn(nativeAudio, "reclaimNativeRecording").mockResolvedValue()
    const recovered = { ...recording, recovery: true }
    port.recordingResults.mockResolvedValue({ sessionId: "s", recordings: [recovered] })
    const backend = createBackend(port, {
      commitRecording: async () => ({ sessionId: "s", revision: 3 }),
    })
    await backend.apply(request())
    await backend.reclaimRecording(recording.recordingId)
    await backend.reclaimRecording(recording.recordingId)
    expect(port.recordingAck).toHaveBeenCalledWith(
      expect.any(String),
      "s",
      recording.recordingId,
      3
    )
    const pending = deferred<undefined>()
    claim.mockReturnValueOnce(pending.promise)
    const late = backend.reclaimRecording("late-take")
    await vi.waitFor(() => expect(claim).toHaveBeenCalledTimes(3))
    backend.dispose()
    pending.resolve(undefined)
    await expect(late).rejects.toThrow("Project changed")
    expect(port.recordingAck).toHaveBeenCalledTimes(2)
  })
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
    const backend = createBackend(port)
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
    const backend = createBackend(port, { commitRecording })
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
    const backend = createBackend(port, { commitRecording })
    const listener = vi.fn()
    const unsubscribe = backend.subscribe(listener)
    await backend.apply(request())
    await vi.advanceTimersByTimeAsync(120)
    expect(listener).not.toHaveBeenCalled()
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
    const backend = createBackend(port, {
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
    const backend = createBackend(port, { commitRecording: () => committed.promise })
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
    const source = transportFixture()
    const backend = createBackend(port, {
      commitRecording: async () => ({ sessionId: "s", revision: 2 }),
      meters: source.port,
    })
    const listener = vi.fn()
    backend.subscribe(listener)
    await backend.apply(request())
    await vi.advanceTimersByTimeAsync(150)
    expect(port.recordingResults).toHaveBeenCalledTimes(1)
    source.queue.push(audioFrame(1n, 3))
    await source.tick(0)
    await source.tick(20)
    source.queue.push(audioFrame(2n, 4, 100n))
    await source.tick(40)
    await source.tick(60)
    expect(listener.mock.calls.map(([frame]) => frame.clock.bar)).toEqual([3, 4])
    expect(port.telemetry.mock.calls.length).toBeGreaterThan(2)
    fetched.resolve({ sessionId: "s", recordings: [] })
    await vi.advanceTimersByTimeAsync(40)
    expect(port.recordingResults).toHaveBeenCalledTimes(2)
    backend.dispose()
  })
})
