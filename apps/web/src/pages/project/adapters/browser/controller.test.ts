// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { createBrowserLibrary } from "./controller"
import type { BrowserAuditionPort, PreparedAudition } from "./controller"
import type {
  BrowserTreeRow,
  BrowserTreeRequest,
  BrowserTreePage,
  nativeBrowserCatalog,
} from "@/shared/native/browser"
const first: BrowserTreeRow = {
  id: "one",
  rootId: "root",
  name: "One.wav",
  path: "/audio/One.wav",
  relativePath: "Vocals/One.wav",
  byteLength: 1000,
  modifiedMillis: 0,
  kind: "audio",
  depth: 1,
  hasChildren: false,
}
const second: BrowserTreeRow = { ...first, id: "two", name: "Two.wav", path: "/audio/Two.wav" }
const folder: BrowserTreeRow = {
  ...first,
  id: "folder",
  name: "Vocals",
  path: "/audio/Vocals",
  relativePath: "Vocals",
  kind: "folder",
  depth: 0,
  hasChildren: true,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => {
    resolve = accept
  })
  return { promise, resolve }
}
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose()
  vi.useRealTimers()
})
function setup() {
  const roots = { revision: 1, roots: [] }
  const port = {
    available: () => true,
    pickFolder: vi.fn(async () => "/audio"),
    roots: vi.fn(async () => roots),
    addRoot: vi.fn(async () => roots),
    refreshRoot: vi.fn(async () => roots),
    cancelScan: vi.fn(async () => {}),
    removeRoot: vi.fn(async () => roots),
    tree: vi.fn(async (request: BrowserTreeRequest): Promise<BrowserTreePage> => ({
      requestId: request.requestId,
      revision: 1,
      total: 3,
      offset: request.offset,
      items: [folder, first, second],
    })),
  } satisfies typeof nativeBrowserCatalog
  const result = createBrowserLibrary(port)
  cleanups.push(() => {
    void result.library.stopAudition()
  })
  return { ...result, port }
}
function audioPort() {
  return {
    select: vi.fn(async () => ({ durationSeconds: 4 })),
    stop: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    read: vi.fn(async () => ({ positionSeconds: 1, durationSeconds: 4, playing: true })),
  } satisfies BrowserAuditionPort
}
it("expands folders without audition and preserves selection while scrolling another window", async () => {
  const { library, useState, port } = setup()
  const audio = audioPort()
  library.configureAudition(audio)
  await library.loadWindow()
  library.select(folder)
  library.toggleFolder(folder)
  await vi.waitFor(() =>
    expect(port.tree).toHaveBeenLastCalledWith(expect.objectContaining({ expanded: [folder.id] }))
  )
  expect(audio.select).not.toHaveBeenCalled()
  library.select(first)
  await vi.waitFor(() => expect(useState.getState().audition.kind).toBe("ready"))
  port.tree.mockImplementationOnce(async request => ({
    requestId: request.requestId,
    revision: 1,
    total: 1000,
    offset: 200,
    items: [second],
  }))
  await library.loadWindow(200)
  expect(useState.getState().selection.all).toEqual(first)
  expect(useState.getState().audition).toMatchObject({ itemId: first.id, playing: true })
})
it("fences an older tree query after changing search", async () => {
  const { library, useState, port } = setup()
  const late = deferred<BrowserTreePage>()
  let requestId = ""
  port.tree.mockImplementationOnce(request => {
    requestId = request.requestId
    return late.promise
  })
  const pending = library.loadWindow()
  library.setQuery("new")
  await vi.waitFor(() => expect(useState.getState().queryState).toBe("ready"))
  late.resolve({ requestId, revision: 1, total: 1, offset: 0, items: [{ ...first, id: "stale" }] })
  await pending
  expect(useState.getState().items.map(row => row.id)).toEqual(["folder", "one", "two"])
})
it("auto-previews raw without BPM and waveform click starts with autoplay disabled", async () => {
  const { library, useState } = setup()
  const audio = audioPort()
  library.configureAudition(audio)
  await library.loadWindow()
  library.setAuditionEnabled(false)
  library.select(first)
  expect(audio.select).not.toHaveBeenCalled()
  await library.seek(0.5)
  expect(audio.select).toHaveBeenCalledWith(first.path)
  expect(audio.seek).toHaveBeenCalledWith(0.5)
  expect(useState.getState().audition).toMatchObject({
    kind: "ready",
    positionSeconds: 2,
    playing: true,
  })
})
it("keeps latest preview and drops a status response after stop", async () => {
  vi.useFakeTimers()
  const { library, useState } = setup()
  const old = deferred<PreparedAudition>(),
    lateStatus = deferred<{ positionSeconds: number; durationSeconds: number; playing: boolean }>()
  const audio = audioPort()
  audio.select.mockImplementationOnce(() => old.promise)
  audio.read.mockImplementationOnce(() => lateStatus.promise)
  library.configureAudition(audio)
  library.select(first)
  library.select(second)
  await Promise.resolve()
  await Promise.resolve()
  old.resolve({ durationSeconds: 1 })
  await Promise.resolve()
  expect(useState.getState().audition).toMatchObject({ itemId: second.id, durationSeconds: 4 })
  await vi.advanceTimersByTimeAsync(33)
  await library.stopAudition()
  lateStatus.resolve({ positionSeconds: 3, durationSeconds: 4, playing: true })
  await Promise.resolve()
  expect(useState.getState().audition).toEqual({ kind: "idle" })
})
it("reports real playback progress and stops polling at the end", async () => {
  vi.useFakeTimers()
  const { library, useState } = setup()
  const audio = audioPort()
  audio.read.mockResolvedValueOnce({ positionSeconds: 4, durationSeconds: 4, playing: false })
  library.configureAudition(audio)
  library.select(first)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(33)
  expect(useState.getState().audition).toMatchObject({ positionSeconds: 4, playing: false })
  await vi.advanceTimersByTimeAsync(200)
  expect(audio.read).toHaveBeenCalledOnce()
})

it("interrupts preparation synchronously and fences late selection before reselecting from zero", async () => {
  vi.useFakeTimers()
  const { library, useState } = setup()
  const prepared = deferred<PreparedAudition>()
  const stopped = deferred<undefined>()
  const audio = audioPort()
  library.configureAudition(audio)
  audio.stop.mockImplementationOnce(() => stopped.promise)
  audio.select.mockImplementationOnce(() => prepared.promise)
  library.select(first)
  expect(useState.getState().audition).toEqual({ kind: "preparing", itemId: first.id })
  const stops = audio.stop.mock.calls.length
  expect(library.interruptAudition()).toBe(true)
  expect(audio.stop).toHaveBeenCalledTimes(stops + 1)
  expect(useState.getState().audition).toEqual({ kind: "idle" })
  expect(useState.getState().selection.all).toEqual(first)
  expect(library.interruptAudition()).toBe(false)
  prepared.resolve({ durationSeconds: 99 })
  await Promise.resolve()
  expect(useState.getState().audition).toEqual({ kind: "idle" })
  await vi.advanceTimersByTimeAsync(100)
  expect(audio.read).not.toHaveBeenCalled()

  library.select(first)
  await Promise.resolve()
  expect(audio.select).toHaveBeenCalledTimes(2)
  expect(audio.select).toHaveBeenLastCalledWith(first.path)
  expect(audio.seek).not.toHaveBeenCalled()
  expect(useState.getState().audition).toEqual({
    kind: "ready",
    itemId: first.id,
    durationSeconds: 4,
    positionSeconds: 0,
    playing: true,
  })
  stopped.resolve(undefined)
  await Promise.resolve()
  expect(useState.getState().audition).toMatchObject({ kind: "ready", positionSeconds: 0 })
})

it("interrupts playing audition and ignores an in-flight poll after restarting the same row", async () => {
  vi.useFakeTimers()
  const { library, useState } = setup()
  const late = deferred<{ positionSeconds: number; durationSeconds: number; playing: boolean }>()
  const audio = audioPort()
  audio.read.mockResolvedValueOnce({ positionSeconds: 2, durationSeconds: 4, playing: true })
  audio.read.mockImplementationOnce(() => late.promise)
  library.configureAudition(audio)
  library.select(first)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(33)
  expect(useState.getState().audition).toMatchObject({ positionSeconds: 2, playing: true })
  await vi.advanceTimersByTimeAsync(33)
  const stops = audio.stop.mock.calls.length
  expect(library.interruptAudition()).toBe(true)
  expect(audio.stop).toHaveBeenCalledTimes(stops + 1)
  expect(useState.getState().audition).toEqual({ kind: "idle" })

  library.select(first)
  await Promise.resolve()
  late.resolve({ positionSeconds: 3, durationSeconds: 4, playing: true })
  await Promise.resolve()
  expect(audio.select).toHaveBeenCalledTimes(2)
  expect(audio.seek).not.toHaveBeenCalled()
  expect(useState.getState().audition).toMatchObject({
    kind: "ready",
    itemId: first.id,
    positionSeconds: 0,
    playing: true,
  })
})

it("does not consume interruption for an audition that has already ended", async () => {
  vi.useFakeTimers()
  const { library, useState } = setup()
  const audio = audioPort()
  audio.read.mockResolvedValue({ positionSeconds: 4, durationSeconds: 4, playing: false })
  library.configureAudition(audio)
  expect(library.interruptAudition()).toBe(false)
  library.select(first)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(33)
  const stops = audio.stop.mock.calls.length
  expect(library.interruptAudition()).toBe(false)
  expect(audio.stop).toHaveBeenCalledTimes(stops)
  expect(useState.getState().audition).toMatchObject({ positionSeconds: 4, playing: false })
})
