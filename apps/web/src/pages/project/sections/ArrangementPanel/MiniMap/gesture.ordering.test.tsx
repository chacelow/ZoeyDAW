// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { gridZoomLimit } from "@/pages/project/model/grid"
import { MiniMap } from "."

const native = vi.hoisted(() => ({
  hasNativeCursor: vi.fn(() => true),
  moveWindowCursor: vi.fn<(x: number, y: number) => Promise<void>>(),
}))
vi.mock("@/shared/native/cursor", () => native)

const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 0
let capture: number | null = null

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function flushFrames() {
  const pending = [...frames.values()]
  frames.clear()
  act(() => {
    for (const callback of pending) {
      callback(performance.now())
    }
  })
}

function pointer(target: Element | Window, type: string, x: number, pointerId = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: 10,
  })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    movementX: { value: 0 },
    movementY: { value: 0 },
  })
  fireEvent(target, event)
}

function Harness() {
  const zoom = useProjectState(s => s.workspace.pxPerBar)
  const scroll = useProjectState(s => s.workspace.scrollX)
  return (
    <MiniMap
      bars={128}
      viewportWidth={640}
      pxPerBar={zoom}
      scrollX={scroll}
      minPxPerBar={5}
      maxPxPerBar={gridZoomLimit(4, 4)}
      onNavigate={() => {}}
    />
  )
}

function mount() {
  const view = render(<Harness />)
  const element = view.container.querySelector<HTMLDivElement>("[data-minimap]")
  if (!element) {
    throw new Error("Missing overview")
  }
  element.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 24)
  return { ...view, el: element }
}

beforeEach(() => {
  frames.clear()
  nextFrame = 0
  capture = null
  native.hasNativeCursor.mockReturnValue(true)
  native.moveWindowCursor.mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  hydrateProject(
    JSON.stringify({
      version: 2,
      document: createMockDocument(),
      workspace: { ...createMockWorkspace(), pxPerBar: 32, scrollX: 64 },
    })
  )
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value: (id: number) => {
        capture = id
      },
    },
    hasPointerCapture: { configurable: true, value: (id: number) => capture === id },
    releasePointerCapture: {
      configurable: true,
      value: () => {
        capture = null
      },
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture")
  Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture")
  Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture")
  document.documentElement.classList.remove("dragpad-dragging")
})

it("settles an in-flight recenter before the final restore, and reveals only after restore completes", async () => {
  const recenter = deferred()
  const restore = deferred()
  native.moveWindowCursor
    .mockImplementationOnce(() => recenter.promise)
    .mockImplementationOnce(() => restore.promise)
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 100)
  flushFrames()
  expect(native.moveWindowCursor).toHaveBeenCalledTimes(1)
  pointer(window, "pointerup", 100)
  expect(native.moveWindowCursor).toHaveBeenCalledTimes(1)
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(true)
  await act(async () => {
    recenter.resolve()
    await recenter.promise
  })
  expect(native.moveWindowCursor).toHaveBeenCalledTimes(2)
  expect(native.moveWindowCursor).toHaveBeenNthCalledWith(2, 80, 10)
  flushFrames()
  flushFrames()
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(true)
  await act(async () => {
    restore.resolve()
    await restore.promise
  })
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(true)
  flushFrames()
  flushFrames()
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(false)
})

it("rejects a new gesture while an old restore is in flight and cannot reveal the accepted next drag later", async () => {
  const restore = deferred()
  native.moveWindowCursor.mockImplementationOnce(() => restore.promise).mockResolvedValue(undefined)
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 100)
  pointer(window, "pointerup", 100)
  await act(async () => {
    await Promise.resolve()
  })
  expect(native.moveWindowCursor).toHaveBeenCalledTimes(1)
  pointer(el, "pointerdown", 90, 2)
  expect(capture).toBeNull()
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(true)
  await act(async () => {
    restore.resolve()
    await restore.promise
  })
  pointer(el, "pointerdown", 90, 3)
  expect(capture).toBe(3)
  pointer(window, "pointermove", 110, 3)
  flushFrames()
  flushFrames()
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(true)
  pointer(window, "pointerup", 110, 3)
  await act(async () => {
    await Promise.resolve()
  })
  flushFrames()
  flushFrames()
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(false)
})

it("completes the final warp before revealing after cancellation and unmount", async () => {
  const recenter = deferred()
  const restore = deferred()
  native.moveWindowCursor
    .mockImplementationOnce(() => recenter.promise)
    .mockImplementationOnce(() => restore.promise)
  const view = mount()
  pointer(view.el, "pointerdown", 80)
  pointer(window, "pointermove", 100)
  flushFrames()
  fireEvent.keyDown(window, { key: "Escape" })
  view.unmount()
  expect(native.moveWindowCursor).toHaveBeenCalledTimes(1)
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(true)
  await act(async () => {
    recenter.resolve()
    await recenter.promise
  })
  expect(native.moveWindowCursor).toHaveBeenCalledTimes(2)
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(true)
  await act(async () => {
    restore.resolve()
    await restore.promise
  })
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(false)
})
