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
import { createClip, createTrack } from "@zoeydaw/project-core/reducers"
import * as waveformRanges from "@/pages/project/adapters/backend/waveform-ranges"

const handoffs = vi.hoisted(() => new Map<string, () => void>())
vi.mock("../canvas/scheduler", () => ({
  arrangementScheduler: {
    register: (id: string, callback: () => void) => {
      handoffs.set(id, callback)
      return () => {
        handoffs.delete(id)
      }
    },
    invalidate: vi.fn(),
  },
}))

function paintFrame() {
  act(() => {
    for (const callback of handoffs.values()) callback()
  })
}

function publishClip(id: string) {
  const scene = arrangementScene.get()
  const track = scene.tracks.find(track => track.kind === "audio")
  if (!track) throw new Error("Audio track fixture required")
  const clip = createClip("audio", 1, 2)
  if (clip.kind !== "audio") throw new Error("Audio clip fixture required")
  arrangementScene.setMusic({
    ...scene,
    media: [
      ...scene.media,
      {
        id: "import-source",
        name: "Voice.wav",
        sha256: "a".repeat(64),
        byteLength: 100,
        sampleRate: 48000,
        frames: 240000,
        channels: 2,
        location: { kind: "external", path: "/Voice.wav" },
      },
    ],
    tracks: scene.tracks.map(candidate =>
      candidate.id === track.id
        ? { ...track, clips: [...track.clips, { ...clip, id, sourceId: "import-source" }] }
        : candidate
    ),
  })
}

function delayedImport() {
  let resolve!: (id: string | null) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string | null>((yes, no) => {
    resolve = yes
    reject = no
  })
  const importing = vi.spyOn(projectFiles, "importAudioAt").mockReturnValue(promise)
  return { resolve, reject, importing }
}

function DropTarget() {
  const drop = useBrowserAudioDrop()
  return (
    <div
      data-testid="drop"
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      <span
        data-testid="ghost"
        data-left={drop.target?.left}
        data-width={drop.target?.width}
        data-clip={drop.clip?.id}
        data-source={drop.source?.path}
      >
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

it("retains a dropped source until the imported clip is present and painted", async () => {
  const pending = delayedImport()
  const { view, transfer, drag } = setup()
  drag("dragOver")
  expect(transfer.dropEffect).toBe("copy")
  expect(view.getByTestId("ghost").textContent).not.toBe("none")
  drag("drop")
  expect(pending.importing).toHaveBeenCalledWith(
    expect.objectContaining({ path: "/Voice.wav", trackId: expect.any(String) })
  )
  expect(view.getByTestId("ghost").textContent).not.toBe("none")
  expect(browserAudioDrag.useState.getState().source).toBeNull()
  act(() =>
    useProjectFilesState.setState({
      operation: { kind: "busy", action: "import", stage: "reading" },
    })
  )
  fireEvent(window, new Event("dragend"))
  fireEvent(window, new Event("blur"))
  expect(view.getByTestId("ghost").textContent).not.toBe("none")
  await act(async () => pending.resolve("imported"))
  paintFrame()
  expect(view.getByTestId("ghost").textContent).not.toBe("none")
  act(() => publishClip("imported"))
  expect(view.getByTestId("ghost").textContent).not.toBe("none")
  expect(view.getByTestId("ghost").getAttribute("data-width")).toBe("200")
  expect(view.getByTestId("ghost").getAttribute("data-clip")).toBe("imported")
  paintFrame()
  expect(view.getByTestId("ghost").textContent).toBe("none")
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

it("reprojects a pending import without changing its musical placement", () => {
  delayedImport()
  const { view, drag } = setup()
  drag("drop")
  const before = view.getByTestId("ghost").textContent
  const left = view.getByTestId("ghost").getAttribute("data-left")
  act(() =>
    arrangementScene.setViewport({
      ...arrangementScene.get().viewport,
      scrollX: 100,
      pxPerBar: 150,
    })
  )
  expect(view.getByTestId("ghost").textContent).toBe(before)
  expect(view.getByTestId("ghost").getAttribute("data-left")).not.toBe(left)
})

it("clears rejected imports", async () => {
  const pending = delayedImport()
  const { view, drag } = setup()
  drag("drop")
  await act(async () => pending.reject(new Error("Import failed")))
  expect(view.getByTestId("ghost").textContent).toBe("none")
  expect(browserAudioDrag.useState.getState().source).toBeNull()
})

it("ignores late imports after unmount without clearing a new drag", async () => {
  const pending = delayedImport()
  const { view, drag } = setup()
  drag("drop")
  view.unmount()
  const next = browserAudioDrag.start({ path: "/Next.wav", name: "Next.wav", durationSeconds: 4 })
  await act(async () => pending.resolve("old-import"))
  expect(browserAudioDrag.useState.getState().source?.token).toBe(next.token)
  expect(handoffs.size).toBe(0)
})

it("does not commit the same pending drop twice", () => {
  const pending = delayedImport()
  const { view, drag } = setup()
  drag("drop")
  drag("drop")
  expect(pending.importing).toHaveBeenCalledTimes(1)
  expect(view.getByTestId("ghost").textContent).not.toBe("none")
})

it("retains the overlay while real waveform ranges are pending", async () => {
  vi.spyOn(waveformRanges, "cachedWaveformRanges").mockReturnValue([])
  const loading = vi.spyOn(waveformRanges, "browserWaveformSourcePending").mockReturnValue(true)
  const pending = delayedImport()
  const { view, drag } = setup()
  drag("drop")
  await act(async () => pending.resolve("imported"))
  act(() => publishClip("imported"))
  paintFrame()
  expect(view.getByTestId("ghost").textContent).not.toBe("none")
  loading.mockReturnValue(false)
  paintFrame()
  expect(view.getByTestId("ghost").textContent).toBe("none")
  expect(loading).toHaveBeenCalled()
})

it("hands off an actually painted card when waveform loading has failed", async () => {
  vi.spyOn(waveformRanges, "browserWaveformSourcePending").mockReturnValue(false)
  const pending = delayedImport()
  const { view, drag } = setup()
  drag("drop")
  await act(async () => pending.resolve("imported"))
  act(() => publishClip("imported"))
  paintFrame()
  expect(view.getByTestId("ghost").textContent).toBe("none")
})

it("retains the new-track source until its real header and clip exist", async () => {
  const scene = arrangementScene.get()
  act(() =>
    arrangementScene.setMusic({
      ...scene,
      tracks: scene.tracks.filter(track => track.kind === "main"),
    })
  )
  const pending = delayedImport()
  const { view, drag } = setup()
  drag("drop")
  expect(view.getByTestId("ghost").textContent).toContain(":new")
  expect(view.getByTestId("ghost").getAttribute("data-source")).toBe("/Voice.wav")
  fireEvent(window, new Event("dragend"))
  expect(view.getByTestId("ghost").textContent).toContain(":new")
  await act(async () => pending.resolve("new-track-clip"))
  paintFrame()
  expect(view.getByTestId("ghost").textContent).toContain(":new")
  const current = arrangementScene.get()
  const track = createTrack("audio", [...current.tracks], undefined, DEFAULT_TRACK_HEIGHT)
  act(() =>
    arrangementScene.setMusic({
      ...current,
      tracks: [
        { ...track, clips: [{ ...createClip("audio", 1, 2), id: "new-track-clip" }] },
        ...current.tracks,
      ],
    })
  )
  expect(view.getByTestId("ghost").textContent).toContain(track.id)
  paintFrame()
  expect(view.getByTestId("ghost").textContent).toBe("none")
})

it("clears a canceled import that returns no clip", async () => {
  const pending = delayedImport()
  const { view, drag } = setup()
  drag("drop")
  await act(async () => pending.resolve(null))
  expect(view.getByTestId("ghost").textContent).toBe("none")
  expect(handoffs.size).toBe(0)
})
