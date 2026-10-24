import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { gridZoomLimit } from "@zoeydaw/project-core/grid"
import { MiniMap } from "."

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
