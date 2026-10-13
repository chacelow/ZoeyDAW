// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { gridZoomLimit } from "@/pages/project/model/grid"
import { MiniMap } from "."

const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 0
let capture: number | null = null

function flush() {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach(callback => callback(16))
}

function pointer(target: Element | Window, type: string, x: number, y = 10, pointerId = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperty(event, "pointerId", { value: pointerId })
  Object.defineProperty(event, "movementX", { value: 0 })
  Object.defineProperty(event, "movementY", { value: 0 })
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
  const el = view.container.querySelector<HTMLDivElement>("[data-minimap]")
  if (!el) throw new Error("Missing overview")
  el.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 24)
  return { ...view, el }
}

beforeEach(() => {
  frames.clear()
  nextFrame = 0
  capture = null
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  hydrateProject(
    JSON.stringify({
      version: 2,
      document: createMockDocument(),
      workspace: { ...createMockWorkspace(), pxPerBar: 32, scrollX: 64 },
    })
  )
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++nextFrame, cb)
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
  Reflect.deleteProperty(document, "pointerLockElement")
  document.documentElement.classList.remove("dragpad-dragging")
})

it("continues across parent rerenders and commits the final move before its animation frame", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 100)
  flush()
  const mid = useProjectState.getState().workspace.scrollX
  pointer(window, "pointermove", 120)
  pointer(window, "pointerup", 120)
  const last = useProjectState.getState().workspace.scrollX
  expect(mid).toBeCloseTo(64 + (20 / 1000) * 128 * 32 * 0.25)
  expect(last).toBeCloseTo(64 + (40 / 1000) * 128 * 32 * 0.25)
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(false)
})

it("cancels live zoom on Escape and does not commit a late pointerup", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 80, 70)
  flush()
  expect(useProjectState.getState().workspace.pxPerBar).toBeGreaterThan(32)
  fireEvent.keyDown(window, { key: "Escape" })
  pointer(window, "pointerup", 80, 70)
  expect(useProjectState.getState().workspace.pxPerBar).toBe(32)
  expect(useProjectState.getState().workspace.scrollX).toBe(64)
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(false)
})

it.each([0.1, 0.5, 0.9])("anchors body zoom at pressed width ratio %s while panning", ratio => {
  const { el } = mount()
  const pressedBar = 64 / 32 + (640 / 32) * ratio
  const x = (pressedBar / 128) * 1000
  pointer(el, "pointerdown", x)
  pointer(window, "pointermove", x + 20, 40)
  pointer(window, "pointerup", x + 20, 40)
  const p = useProjectState.getState().workspace
  const movedBar = pressedBar + (20 / 1000) * 128 * 0.25
  expect(p.pxPerBar).toBeGreaterThan(32)
  expect((movedBar * p.pxPerBar - p.scrollX) / 640).toBeCloseTo(ratio)
})

it("keeps the pressed position anchored after an outside click clamps against the project end", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 990)
  const initial = useProjectState.getState().workspace
  expect(initial.scrollX).toBe(128 * 32 - 640)
  const pressedBar = (990 / 1000) * 128
  const ratio = (pressedBar * 32 - initial.scrollX) / 640
  pointer(window, "pointermove", 990, 40)
  pointer(window, "pointerup", 990, 40)
  const p = useProjectState.getState().workspace
  expect((pressedBar * p.pxPerBar - p.scrollX) / 640).toBeCloseTo(ratio)
  expect(p.scrollX + 640).toBeLessThanOrEqual(128 * p.pxPerBar)
})

it("pins the opposite musical boundary during a one-sided edge resize", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 171)
  pointer(window, "pointermove", 121)
  pointer(window, "pointerup", 121)
  const p = useProjectState.getState().workspace
  expect(p.scrollX / p.pxPerBar).toBeCloseTo(2)
  expect(p.pxPerBar).toBeGreaterThan(32)
})

it("ignores another pointer releasing and rolls back on blur", () => {
  const { el } = mount()
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 100)
  flush()
  pointer(window, "pointerup", 100, 10, 2)
  pointer(window, "pointermove", 120)
  flush()
  expect(useProjectState.getState().workspace.scrollX).toBeGreaterThan(64)
  fireEvent(window, new Event("blur"))
  expect(useProjectState.getState().workspace.scrollX).toBe(64)
  expect(document.documentElement.classList.contains("dragpad-dragging")).toBe(false)
})

it("releases a pointer lock granted after mouseup", async () => {
  const { el } = mount()
  let grant: (() => void) | undefined
  const request = new Promise<void>(resolve => {
    grant = resolve
  })
  const exit = vi.fn(() =>
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: null })
  )
  Object.defineProperty(el, "requestPointerLock", { configurable: true, value: () => request })
  Object.defineProperty(document, "exitPointerLock", { configurable: true, value: exit })
  pointer(el, "pointerdown", 80)
  pointer(window, "pointermove", 100)
  pointer(window, "pointerup", 100)
  Object.defineProperty(document, "pointerLockElement", { configurable: true, value: el })
  grant?.()
  await request
  await Promise.resolve()
  expect(exit).toHaveBeenCalledOnce()
  expect(document.pointerLockElement).toBeNull()
  Reflect.deleteProperty(document, "exitPointerLock")
})
