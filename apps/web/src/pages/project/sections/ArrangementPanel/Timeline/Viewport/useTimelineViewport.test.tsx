// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
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
  useTimelineViewport(container, body, canvas)
  return (
    <div ref={container}>
      <div ref={body}>
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
      version: 2,
      document: createMockDocument(),
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
