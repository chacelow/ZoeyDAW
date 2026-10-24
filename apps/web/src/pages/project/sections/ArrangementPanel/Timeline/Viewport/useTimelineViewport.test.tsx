import { DEFAULT_TRACK_HEIGHT, arrangementViewProjection } from "@/pages/project/layout"
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { useTimelineViewport } from "./useTimelineViewport"

const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
function frame() {
  const pending = [...frames.values()]
  frames.clear()
  act(() => {
    for (const callback of pending) {
      callback(performance.now())
    }
  })
}
function Viewport() {
  const container = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const viewport = useTimelineViewport(container, body, canvas)
  return (
    <div
      ref={container}
      data-viewport-width={viewport.timeViewportWidth}
      data-controls-width={viewport.controlsWidth}
      data-bars={viewport.bars}
    >
      <div ref={body} data-viewport-body>
        <div ref={canvas} />
      </div>
    </div>
  )
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id)
  })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 704, 300)
  )
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: {
        ...createMockWorkspace(),
        follow: true,
        pxPerBar: 100,
        scrollX: 0,
      },
    })
  )
})
afterEach(() => {
  cleanup()
  frame()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("scrolls continuously only after playback reaches the center of the canvas, excluding track controls", () => {
  render(<Viewport />)
  act(() => projectActions.togglePlay())
  act(() => projectActions.seekBar(2))
  frame()
  expect(useProjectState.getState().workspace.scrollX).toBe(0)
  act(() => projectActions.seekBar(3.5))
  frame()
  expect(useProjectState.getState().workspace.scrollX).toBe(50)
  act(() => projectActions.seekBar(3.75))
  frame()
  expect(useProjectState.getState().workspace.scrollX).toBe(75)
  act(() => projectActions.seekBar(1.25))
  frame()
  expect(useProjectState.getState().workspace.scrollX).toBe(0)
})

it("does not move the viewport when Follow is disabled or playback is stopped", () => {
  render(<Viewport />)
  act(() => projectActions.seekBar(5))
  frame()
  expect(useProjectState.getState().workspace.scrollX).toBe(0)
  act(() => projectActions.setFollow(false))
  act(() => projectActions.togglePlay())
  frame()
  expect(useProjectState.getState().workspace.scrollX).toBe(0)
  act(() => projectActions.setFollow(true))
  frame()
  expect(useProjectState.getState().workspace.scrollX).toBe(200)
  act(() => projectActions.stop())
  act(() => projectActions.seekBar(8))
  frame()
  expect(useProjectState.getState().workspace.scrollX).toBe(200)
})

it("widens the timeline, minimap viewport and zoom bounds when I/O is hidden", () => {
  const view = render(<Viewport />)
  const element = view.container.querySelector<HTMLElement>("[data-viewport-width]")!
  const before = Number(element.dataset.viewportWidth)
  const width = Number(element.dataset.controlsWidth)
  act(() => projectActions.setArrangementView("routing", false))
  const state = useProjectState.getState()
  const projected = arrangementViewProjection(
    state.document.tracks,
    state.workspace.arrangementView
  )
  expect(Number(element.dataset.controlsWidth)).toBe(projected.controlsWidth)
  expect(Number(element.dataset.viewportWidth)).toBe(before + width - projected.controlsWidth)
  act(() => projectActions.setArrangementView("routing", true))
  expect(Number(element.dataset.viewportWidth)).toBe(before)
})

it("extends the overview to the visible end without adding song tail twice", () => {
  const view = render(<Viewport />)
  const element = view.container.querySelector<HTMLElement>("[data-bars]")!
  expect(Number(element.dataset.bars)).toBe(58)
  act(() => projectActions.setViewport({ pxPerBar: 2, scrollX: 0 }))
  expect(Number(element.dataset.bars)).toBe(199.5)
  act(() => projectActions.setViewport({ pxPerBar: 100, scrollX: 0 }))
  expect(Number(element.dataset.bars)).toBe(58)
})

it("keeps the zero-based playing position centered when zooming with Follow", () => {
  const view = render(<Viewport />)
  act(() => projectActions.togglePlay())
  act(() => projectActions.seekBar(10))
  frame()
  fireEvent.wheel(view.container.querySelector("[data-viewport-body]")!, {
    ctrlKey: true,
    deltaY: -26,
    clientX: 100,
  })
  const p = useProjectState.getState().workspace
  expect((10 - 1) * p.pxPerBar - p.scrollX).toBeCloseTo(352)
})
