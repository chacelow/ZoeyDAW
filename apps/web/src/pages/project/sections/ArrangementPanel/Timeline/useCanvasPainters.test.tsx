// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useCanvasPainters } from "./useCanvasPainters"
import { paintGrid } from "../canvas/painters/grid"
import { paintPlayhead } from "../canvas/painters/playhead"

vi.mock("../canvas/audio/project-telemetry", () => ({ attachProjectTelemetry: () => () => {} }))
vi.mock("../canvas/scheduler", () => ({
  arrangementScheduler: { register: () => () => {}, invalidate: () => {} },
}))
vi.mock("../canvas/tokens", () => ({
  readTokens: () => ({ "--primary": "rgb(0, 100, 200)", "--foreground": "rgb(240, 240, 240)" }),
  readThemeStamp: () => "theme",
  gridTokens: () => ({}),
}))
vi.mock("../canvas/painters/grid", () => ({ paintGrid: vi.fn() }))
vi.mock("../canvas/painters/clip", () => ({ paintClips: vi.fn() }))
vi.mock("../canvas/painters/automation", () => ({ paintAutomation: vi.fn() }))
vi.mock("../canvas/painters/playhead", () => ({
  paintPlayhead: vi.fn(),
  paintGuides: vi.fn(),
  paintClipAlignment: vi.fn(),
}))

let notify = () => {}
const disconnect = vi.fn()
let rect = new DOMRect(0, 0, 1000, 600)

function Surface() {
  const body = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const playhead = useRef<HTMLCanvasElement>(null)
  useCanvasPainters(body, canvas, playhead)
  return (
    <div ref={body}>
      <canvas ref={canvas} aria-label="Arrangement" className="absolute inset-0 size-full" />
      <canvas
        ref={playhead}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
      />
    </div>
  )
}

beforeEach(() => {
  rect = new DOMRect(0, 0, 1000, 600)
  vi.clearAllMocks()
  vi.stubGlobal("devicePixelRatio", 2)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notify = callback
      }
      observe() {}
      disconnect = disconnect
    }
  )
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect)
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    vi.fn().mockReturnValue({})
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("keeps CSS dimensions layout-owned while resizing and repainting both backing stores synchronously", () => {
  const view = render(<Surface />)
  const canvases = [...view.container.querySelectorAll("canvas")]
  const assertDimensions = (width: number, height: number) => {
    for (const canvas of canvases) {
      expect(canvas.style.width).toBe("")
      expect(canvas.style.height).toBe("")
      expect(canvas.width).toBe(width)
      expect(canvas.height).toBe(height)
    }
  }
  assertDimensions(2000, 1200)
  vi.mocked(paintGrid).mockClear()
  vi.mocked(paintPlayhead).mockClear()
  rect = new DOMRect(0, 0, 172, 476.625)
  act(() => notify())
  assertDimensions(344, 953)
  expect(paintGrid).toHaveBeenCalledTimes(1)
  expect(paintPlayhead).toHaveBeenCalledTimes(1)
  act(() => notify())
  expect(paintGrid).toHaveBeenCalledTimes(1)
  expect(paintPlayhead).toHaveBeenCalledTimes(1)
})

it("disconnects and fences a retained observer notification after unmount", () => {
  const view = render(<Surface />)
  const canvases = [...view.container.querySelectorAll("canvas")]
  view.unmount()
  expect(disconnect).toHaveBeenCalledTimes(1)
  vi.mocked(paintGrid).mockClear()
  vi.mocked(paintPlayhead).mockClear()
  rect = new DOMRect(0, 0, 172, 476.625)
  act(() => notify())
  expect(canvases.map(canvas => [canvas.width, canvas.height])).toEqual([
    [2000, 1200],
    [2000, 1200],
  ])
  expect(paintGrid).not.toHaveBeenCalled()
  expect(paintPlayhead).not.toHaveBeenCalled()
})
