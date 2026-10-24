import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { projectFiles, useProjectFilesState } from "@/pages/project/adapters"
import { browserAudioDrag, BROWSER_AUDIO_MIME } from "@/pages/project/adapters/browser"
import { initialDocument } from "@zoeydaw/project-runtime/state"
import { DEFAULT_GRID } from "@zoeydaw/project-core/grid"
import { arrangementScene } from "../canvas/scene"
import { arrangementBodyTop } from "../canvas/layout"
import { useBrowserAudioDrop } from "./useBrowserAudioDrop"

function DropTarget() {
  const drop = useBrowserAudioDrop()
  return (
    <div
      data-testid="drop"
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      <span data-testid="ghost">
        {drop.target ? `${drop.target.startBar}:${drop.target.trackId ?? "new"}` : "none"}
      </span>
    </div>
  )
}
function setup() {
  const view = render(<DropTarget />)
  const host = view.getByTestId("drop")
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 700))
  let token = ""
  act(() => {
    token = browserAudioDrag.start({
      path: "/Voice.wav",
      name: "Voice.wav",
      durationSeconds: 5,
    }).token
  })
  const transfer = { types: [BROWSER_AUDIO_MIME], dropEffect: "none", getData: () => token }
  function drag(kind: "dragOver" | "drop", x = 32, y = arrangementBodyTop() + 5) {
    const event = createEvent[kind](host, { dataTransfer: transfer })
    Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } })
    fireEvent(host, event)
  }
  return { view, host, transfer, drag }
}

beforeEach(() => {
  const document = initialDocument(DEFAULT_TRACK_HEIGHT)
  arrangementScene.setMusic({
    ...document,
    loop: document.transport.loop,
    bars: 128,
    grid: DEFAULT_GRID,
  })
  arrangementScene.setViewport({
    width: 500,
    height: 700,
    scrollX: 0,
    scrollY: 0,
    pxPerBar: 100,
    dpr: 1,
  })
  useProjectFilesState.setState({ operation: { kind: "idle" } })
})
afterEach(() => {
  cleanup()
  browserAudioDrag.clear()
  useProjectFilesState.setState({ operation: { kind: "idle" } })
  vi.restoreAllMocks()
})

it("shows a copy target and imports the captured typed source into Audio", () => {
  const importing = vi.spyOn(projectFiles, "importAudioAt").mockResolvedValue("clip")
  const { view, transfer, drag } = setup()
  drag("dragOver")
  expect(transfer.dropEffect).toBe("copy")
  expect(view.getByTestId("ghost").textContent).not.toBe("none")
  drag("drop")
  expect(importing).toHaveBeenCalledWith(
    expect.objectContaining({ path: "/Voice.wav", trackId: expect.any(String) })
  )
  expect(view.getByTestId("ghost").textContent).toBe("none")
  expect(browserAudioDrag.useState.getState().source).toBeNull()
})

it.each(["Escape", "blur", "dragend"])(
  "clears both ghost and source on %s and rejects the stale drop",
  reason => {
    const importing = vi.spyOn(projectFiles, "importAudioAt").mockResolvedValue("clip")
    const { view, drag } = setup()
    drag("dragOver")
    if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" })
    else fireEvent(window, new Event(reason))
    expect(view.getByTestId("ghost").textContent).toBe("none")
    expect(browserAudioDrag.useState.getState().source).toBeNull()
    drag("drop")
    expect(importing).not.toHaveBeenCalled()
  }
)

it("rejects header targets and busy imports with no-drop feedback", () => {
  const importing = vi.spyOn(projectFiles, "importAudioAt").mockResolvedValue("clip")
  const { view, transfer, drag } = setup()
  drag("dragOver", 30, 10)
  expect(transfer.dropEffect).toBe("none")
  act(() =>
    useProjectFilesState.setState({
      operation: { kind: "busy", action: "import", stage: "reading" },
    })
  )
  drag("dragOver")
  expect(transfer.dropEffect).toBe("none")
  expect(view.getByTestId("ghost").textContent).toBe("none")
  drag("drop")
  expect(importing).not.toHaveBeenCalled()
})

it("updates the target when the shared viewport scrolls under the stationary pointer", () => {
  const { view, drag } = setup()
  drag("dragOver")
  const before = view.getByTestId("ghost").textContent
  act(() => arrangementScene.setViewport({ ...arrangementScene.get().viewport, scrollX: 100 }))
  expect(view.getByTestId("ghost").textContent).not.toBe(before)
})

it("clears session ownership when the destination unmounts", () => {
  const { view, drag } = setup()
  drag("dragOver")
  view.unmount()
  expect(browserAudioDrag.useState.getState().source).toBeNull()
})
