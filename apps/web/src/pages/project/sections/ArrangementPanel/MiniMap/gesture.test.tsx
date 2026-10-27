import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { gridZoomLimit } from "@zoeydaw/project-core/grid"
import { MiniMap } from "."
import { minimapFrame } from "./zoom"

const cursor = vi.hoisted(() => ({
  relative: false,
  native: false,
  release: vi.fn(),
  acquire: vi.fn(),
}))
vi.mock("@/shared/native/cursor", () => ({
  hasNativeCursor: () => cursor.native,
  acquireCursorLock: cursor.acquire,
}))

const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 0
let capture: number | null = null

function pointer(target: Element | Window, type: string, x: number, y = 10, pointerId = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
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
      minPxPerBar={639 / 128}
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
  cursor.relative = false
  cursor.native = false
  cursor.release.mockClear()
  cursor.acquire.mockImplementation(() => ({
    phase: "locked",
    get relative() {
      return cursor.relative
    },
    release: cursor.release,
  }))
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
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
})

it("moves content by the native horizontal delta without overview amplification", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 100)
  expect(useProjectState.getState().workspace.scrollX).toBe(84)
  pointer(window, "pointermove", 120)
  pointer(window, "pointerup", 120)
  expect(useProjectState.getState().workspace.scrollX).toBe(104)
})

it("processes one pixel immediately and keeps the live view on blur", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 81)
  expect(useProjectState.getState().workspace.scrollX).toBe(65)
  fireEvent(window, new Event("blur"))
  pointer(window, "pointermove", 100)
  expect(useProjectState.getState().workspace.scrollX).toBe(65)
})

it("zooms in downward and preserves the live view when Escape ends the gesture", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 80, 30)
  const zoomed = useProjectState.getState().workspace
  expect(zoomed.pxPerBar).toBeCloseTo(38.3984375)
  fireEvent.keyDown(window, { key: "Escape" })
  pointer(window, "pointermove", 80, 50)
  pointer(window, "pointerup", 80, 50)
  expect(useProjectState.getState().workspace.pxPerBar).toBe(zoomed.pxPerBar)
  expect(useProjectState.getState().workspace.scrollX).toBe(zoomed.scrollX)
})

it("zooms out upward", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 80, -10)
  pointer(window, "pointerup", 80, -10)
  expect(useProjectState.getState().workspace.pxPerBar).toBe(25.59375)
})

it("keeps the mapped content anchor while vertically zooming", () => {
  const { el } = mount()
  const anchor = Math.round((128 * 32 * (80 - 2)) / 996) / 32
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 82, 30)
  const p = useProjectState.getState().workspace
  expect(Math.abs(anchor * p.pxPerBar - p.scrollX - (anchor * 32 - 64))).toBeLessThanOrEqual(0.5)
  pointer(window, "pointerup", 82, 30)
})

it("uses the dominant axis and ignores the other movement", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 100, 15)
  expect(useProjectState.getState().workspace.pxPerBar).toBe(32)
  expect(useProjectState.getState().workspace.scrollX).toBe(84)
  pointer(window, "pointerup", 100, 15)
})

it("keeps an inside press stationary and fits through double click", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointerup", 80)
  expect(useProjectState.getState().workspace.scrollX).toBe(64)
  fireEvent.doubleClick(el, { clientX: 80, clientY: 10 })
  expect(useProjectState.getState().workspace.pxPerBar).toBe(639 / 128)
  expect(useProjectState.getState().workspace.scrollX).toBe(0)
})

it("holds the opposite time boundary while resizing either edge", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 173)
  pointer(window, "pointermove", 123)
  const p = useProjectState.getState().workspace
  expect(Math.abs(p.scrollX - 2 * p.pxPerBar)).toBeLessThanOrEqual(0.5)
  expect(p.pxPerBar).toBeGreaterThan(32)
  pointer(window, "pointerup", 123)
})

it("zooms by wheel only with the zoom modifier and leaves ordinary wheel untouched", () => {
  const { el } = mount()
  fireEvent.wheel(el, { deltaY: -10, clientX: 80 })
  expect(useProjectState.getState().workspace.pxPerBar).toBe(32)
  fireEvent.wheel(el, { deltaY: -10, clientX: 80, ctrlKey: true })
  expect(useProjectState.getState().workspace.pxPerBar).toBeGreaterThan(32)
})

it("accumulates fractional wheel motion before applying native integer deltas", () => {
  const { el } = mount()
  fireEvent.wheel(el, { deltaY: -0.4, clientX: 80, ctrlKey: true })
  fireEvent.wheel(el, { deltaY: -0.4, clientX: 80, ctrlKey: true })
  expect(useProjectState.getState().workspace.pxPerBar).toBe(32)
  fireEvent.wheel(el, { deltaY: -0.4, clientX: 80, ctrlKey: true })
  expect(useProjectState.getState().workspace.pxPerBar).toBe(32.15625)
})

it("ignores another pointer release and stops on capture loss without rollback", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 100)
  pointer(window, "pointerup", 100, 10, 2)
  pointer(window, "pointermove", 120)
  expect(useProjectState.getState().workspace.scrollX).toBe(104)
  pointer(el, "lostpointercapture", 120)
  pointer(window, "pointermove", 140)
  expect(useProjectState.getState().workspace.scrollX).toBe(104)
})

function relativeMove(type: "pointermove" | "mousemove", dx: number, dy = 0, x = 80, y = 100) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperties(event, {
    ...(type === "pointermove" ? { pointerId: { value: 1 } } : {}),
    movementX: { value: dx },
    movementY: { value: dy },
  })
  fireEvent(window, event)
}

it("accumulates native relative motion while the physical pointer stays fixed", () => {
  cursor.native = true
  cursor.relative = true
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  relativeMove("pointermove", 20)
  relativeMove("pointermove", 20)
  expect(useProjectState.getState().workspace.scrollX).toBe(104)
  relativeMove("pointermove", 0, 20)
  expect(useProjectState.getState().workspace.pxPerBar).toBeCloseTo(38.3984375)
  pointer(window, "pointerup", 80)
  expect(cursor.release).toHaveBeenCalledTimes(1)
})

it("uses browser locked mouse events without counting compatibility pointer events twice", () => {
  cursor.relative = true
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  relativeMove("pointermove", 20)
  relativeMove("mousemove", 20)
  pointer(el, "lostpointercapture", 80)
  relativeMove("mousemove", 20)
  expect(useProjectState.getState().workspace.scrollX).toBe(104)
  fireEvent.mouseUp(window, { button: 0 })
  relativeMove("mousemove", 20)
  expect(useProjectState.getState().workspace.scrollX).toBe(104)
  expect(cursor.release).toHaveBeenCalledTimes(1)
})

it("uses locked mouse motion in the Windows native window", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Windows NT 10.0")
  cursor.native = true
  cursor.relative = true
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  relativeMove("pointermove", 20)
  relativeMove("mousemove", 20)
  relativeMove("mousemove", 20)
  expect(useProjectState.getState().workspace.scrollX).toBe(104)
  fireEvent.mouseUp(window, { button: 0 })
  expect(cursor.release).toHaveBeenCalledOnce()
})

it.each(["pointercancel", "blur", "unmount", "escape"])(
  "releases its native lease on %s without rolling back",
  end => {
    cursor.native = true
    cursor.relative = true
    const { el, unmount } = mount()
    pointer(el, "pointerdown", 80)
    relativeMove("pointermove", 20)
    if (end === "unmount") unmount()
    else if (end === "escape") fireEvent.keyDown(window, { key: "Escape" })
    else if (end === "blur") fireEvent(window, new Event("blur"))
    else pointer(window, "pointercancel", 80)
    relativeMove("pointermove", 20)
    expect(useProjectState.getState().workspace.scrollX).toBe(84)
    expect(cursor.release).toHaveBeenCalledTimes(1)
  }
)

it("retains the edge resize projection with relative movement and a fixed client point", () => {
  cursor.native = true
  cursor.relative = true
  const { el } = mount()
  pointer(el, "pointerdown", 173)
  relativeMove("pointermove", -50)
  const p = useProjectState.getState().workspace
  expect(Math.abs(p.scrollX - 2 * p.pxPerBar)).toBeLessThanOrEqual(0.5)
  expect(p.pxPerBar).toBeGreaterThan(32)
})

it("releases an acquisition still awaiting its native acknowledgement when unmounted", () => {
  cursor.native = true
  cursor.relative = true
  cursor.acquire.mockImplementation(() => ({
    phase: "acquiring",
    relative: true,
    release: cursor.release,
  }))
  const { el, unmount } = mount()
  pointer(el, "pointerdown", 80)
  unmount()
  expect(cursor.release).toHaveBeenCalledOnce()
})

it("keeps the left-edge opposite boundary and minimum frame clamp under unlimited relative travel", () => {
  cursor.native = true
  cursor.relative = true
  const { el } = mount()
  pointer(el, "pointerdown", 16)
  relativeMove("pointermove", 1000)
  const clamped = useProjectState.getState().workspace
  expect(Math.abs(clamped.scrollX + 640 - 22 * clamped.pxPerBar)).toBeLessThanOrEqual(0.5)
  expect(clamped.pxPerBar).toBeGreaterThan(32)
  relativeMove("pointermove", 1000)
  const continued = useProjectState.getState().workspace
  expect(continued.pxPerBar).toBe(clamped.pxPerBar)
})

it.each([0.25, 0.5, 0.75])(
  "restores the pointer at fraction %s inside the resized viewport frame",
  fraction => {
    cursor.native = true
    cursor.relative = true
    const geometry = () => ({
      ...useProjectState.getState().workspace,
      bars: 128,
      viewportWidth: 640,
      minPxPerBar: 639 / 128,
      maxPxPerBar: gridZoomLimit(4, 4),
      onNavigate: () => {},
    })
    const { el } = mount()
    const before = minimapFrame(1000, geometry())
    const downX = before.left + (before.right - before.left) * fraction
    pointer(el, "pointerdown", downX)
    relativeMove("pointermove", 0, 40)
    const after = minimapFrame(1000, geometry())
    expect(after.right - after.left).toBeLessThan(before.right - before.left)
    const restore = cursor.acquire.mock.calls.at(-1)?.[4]
    let restored: { x: number; y: number } | undefined
    cursor.release.mockImplementationOnce(() => {
      restored = restore()
    })
    pointer(window, "pointerup", downX)
    expect(restored?.x).toBeCloseTo(after.left + fraction * (after.right - after.left))
    expect(restored?.y).toBe(10)
    expect(restored?.x).not.toBeCloseTo(fraction * 1000)
  }
)
