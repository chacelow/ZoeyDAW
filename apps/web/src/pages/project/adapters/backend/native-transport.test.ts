// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { readProjectMeters } from "../realtime"
import { audioPort, createBackend, deferred, request } from "./native.testing"
import { attachProjectMeterScheduler } from "@/pages/project/components/ProjectMeter/scheduler"
import {
  audioFrame,
  stoppedFrame,
  transportFixture,
  unavailableFrame,
} from "./native-transport.testing"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("uses the same-block audible coordinate and preserves full u64 identities with no meter endpoints", async () => {
  vi.useFakeTimers()
  const audio = audioPort()
  audio.apply.mockResolvedValue({
    kind: "accepted",
    sessionId: "s",
    sequence: 0,
    revision: 0,
    controlGeneration: "9007199254740993",
  })
  const source = transportFixture()
  const backend = createBackend(audio, { meters: source.port })
  const receive = vi.fn()
  const detach = backend.subscribe(receive)
  await backend.apply({ ...request(), controlGeneration: "9007199254740993" })
  source.queue.push(audioFrame(9007199254740993n, 3))
  await source.tick(0)
  await source.tick(20)
  expect(receive).toHaveBeenLastCalledWith({
    sessionId: "s",
    sequence: 1,
    appliedSequence: 0,
    controlGeneration: "9007199254740993",
    playing: true,
    recording: false,
    clock: { kind: "sample", bar: 3, barsPerSecond: 0.5, frame: 48000, sampleRate: 48000 },
  })
  expect(backend.readMeters?.()?.readLatest()?.frame.header.seq).toBe(9007199254740993n)
  expect(source.port.interest).toHaveBeenLastCalledWith(
    expect.objectContaining({ endpointIds: [], transport: true })
  )
  await vi.advanceTimersByTimeAsync(80)
  expect(receive).toHaveBeenCalledTimes(1)
  detach()
  expect(backend.readMeters?.()?.readMetadata().transport).toBe(false)
  backend.dispose()
})

it("does not refresh the backend clock when a Hub publication repeats the same audio observation", async () => {
  const source = transportFixture()
  const backend = createBackend(audioPort(), { meters: source.port })
  const receive = vi.fn()
  backend.subscribe(receive)
  await backend.apply(request())
  source.queue.push(audioFrame(1n, 3))
  await source.tick(0)
  await source.tick(20)
  source.queue.push(audioFrame(2n, 3))
  await source.tick(40)
  await source.tick(60)
  expect(receive).toHaveBeenCalledTimes(1)
  source.queue.push(audioFrame(3n, 4, 100n))
  await source.tick(80)
  await source.tick(100)
  expect(receive).toHaveBeenCalledTimes(2)
  expect(receive.mock.lastCall?.[0].clock.bar).toBe(4)
  backend.dispose()
})

it("publishes a stopped seek without inventing a sample clock and ignores unavailable coordinates", async () => {
  const source = transportFixture()
  const backend = createBackend(audioPort(), { meters: source.port })
  const receive = vi.fn()
  backend.subscribe(receive)
  await backend.apply(request())
  source.queue.push(stoppedFrame(1n, 9))
  await source.tick(0)
  await source.tick(20)
  expect(receive).toHaveBeenLastCalledWith({
    sessionId: "s",
    sequence: 1,
    appliedSequence: 5,
    controlGeneration: "9007199254740994",
    clock: { kind: "musical", bar: 9, barsPerSecond: 0.5 },
    playing: false,
    recording: false,
  })
  source.queue.push(unavailableFrame(2n))
  await source.tick(40)
  await source.tick(60)
  expect(receive).toHaveBeenCalledTimes(1)
  source.queue.push(stoppedFrame(3n, 9))
  await source.tick(80)
  await source.tick(100)
  expect(receive).toHaveBeenCalledTimes(1)
  backend.dispose()
})

it("drops a binary response arriving after disposal and closes the admitted stream once", async () => {
  const source = transportFixture()
  const response = deferred<ArrayBuffer>()
  vi.mocked(source.port.snapshot).mockReturnValueOnce(response.promise)
  const backend = createBackend(audioPort(), { meters: source.port })
  const receive = vi.fn()
  backend.subscribe(receive)
  await backend.apply(request())
  await source.tick(0)
  backend.dispose()
  response.resolve(audioFrame(1n, 3))
  await source.tick(20)
  expect(receive).not.toHaveBeenCalled()
  expect(readProjectMeters()).toBeNull()
  expect(source.port.close).toHaveBeenCalledExactlyOnceWith(7)
})

it("continues delivering transport frames when animation frames stop", async () => {
  vi.useFakeTimers()
  vi.stubGlobal("requestAnimationFrame", () => 1)
  vi.stubGlobal("cancelAnimationFrame", () => {})
  const source = transportFixture()
  const backend = createBackend(audioPort(), { meters: source.port })
  const receive = vi.fn()
  backend.subscribe(receive)
  await backend.apply(request())
  source.queue.push(audioFrame(1n, 3))
  const detach = attachProjectMeterScheduler()
  await vi.advanceTimersByTimeAsync(500)
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({ playing: true }))
  detach()
  const pulls = vi.mocked(source.port.snapshot).mock.calls.length
  backend.dispose()
  await vi.advanceTimersByTimeAsync(500)
  expect(source.port.snapshot).toHaveBeenCalledTimes(pulls)
})
