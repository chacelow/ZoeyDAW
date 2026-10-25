// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { z } from "zod"
import { createStore } from "zustand/vanilla"
import { createProjectRuntime } from "@zoeydaw/project-runtime"
import { initialDocument, initialSession, initialWorkspace } from "@zoeydaw/project-runtime/state"
import type { ProjectState } from "@zoeydaw/project-core/types"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import type { BackendDocumentRequest } from "@zoeydaw/project-core/backend"
import type { NativeNoteResult, NativePlaybackResult } from "@/shared/native/audio"
import * as sourceLocations from "./source-locations"
import {
  createBackend,
  audioPort,
  deferred,
  request,
  controlRequest,
  noteRequest,
} from "./native.testing"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it("blocks an old playing open when Stop arrives before admission resolves", async () => {
  const port = audioPort()
  const admitted = deferred<undefined>()
  port.acquire.mockReturnValueOnce(admitted.promise)
  const backend = createBackend(port)
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
    backendFactory: () => createBackend(port),
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
  const backend = createBackend(port)
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
  const backend = createBackend(port)
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
  const backend = createBackend(port)
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
  const backend = createBackend(port)
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
  const backend = createBackend(port)
  expect(await backend.apply(request())).toMatchObject({ kind: "rejected", code: "connection" })
  expect(port.acquire).toHaveBeenCalledTimes(1)
  expect(port.apply).not.toHaveBeenCalled()
  backend.dispose()
  await Promise.resolve()
})

it("waits for in-flight control and note before release and drops disposed replies", async () => {
  vi.useFakeTimers()
  const port = audioPort()
  const backend = createBackend(port)
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
