// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { RULER_HEIGHT } from "./geometry"
import { useMidiViewport } from "./useMidiViewport"
import type { MidiClip } from "@zoeydaw/project-core/types"

const clip: MidiClip = {
  id: "fit-pitches",
  kind: "midi",
  startBar: 1,
  lengthBars: 1,
  notes: [60, 64, 67].map(pitch => ({
    id: `pitch-${pitch}`,
    pitch,
    startBeat: 0,
    lengthBeats: 1,
    velocity: 100,
  })),
}

function Viewport({ source }: { readonly source: MidiClip }) {
  const view = useMidiViewport(source, 4)
  return <div ref={view.viewport} data-testid="viewport" data-row-height={view.rowHeight} />
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it("fits C3, E3 and G3 inside the measured height below the sticky ruler", () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(127)
  const view = render(<Viewport source={clip} />)
  const viewport = view.getByTestId("viewport")
  const rowHeight = Number(viewport.dataset.rowHeight)
  const highestTop = RULER_HEIGHT + (127 - 67) * rowHeight - viewport.scrollTop
  const lowestBottom = RULER_HEIGHT + (127 - 60 + 1) * rowHeight - viewport.scrollTop
  expect(rowHeight).toBeLessThan(18)
  expect(highestTop).toBeGreaterThanOrEqual(RULER_HEIGHT)
  expect(lowestBottom).toBeLessThanOrEqual(127)
  expect((highestTop + lowestBottom) / 2).toBe((127 + RULER_HEIGHT) / 2)
})

it("does not refit or recenter when editing notes after the initial fit", () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(127)
  const view = render(<Viewport source={clip} />)
  const viewport = view.getByTestId("viewport")
  const rowHeight = viewport.dataset.rowHeight
  viewport.scrollTop = 300
  view.rerender(
    <Viewport
      source={{
        ...clip,
        notes: [
          ...clip.notes,
          {
            id: "new-high-note",
            pitch: 100,
            startBeat: 2,
            lengthBeats: 1,
            velocity: 90,
          },
        ],
      }}
    />
  )
  expect(viewport.scrollTop).toBe(300)
  expect(viewport.dataset.rowHeight).toBe(rowHeight)
})

it("uses deterministic normal-sized rows when DOM measurement is zero", () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(0)
  const view = render(<Viewport source={clip} />)
  const viewport = view.getByTestId("viewport")
  expect(viewport.dataset.rowHeight).toBe("18")
  expect(viewport.scrollTop).toBe(64 * 18)
  viewport.scrollTop = 500
  view.rerender(
    <Viewport source={{ ...clip, notes: clip.notes.map(note => ({ ...note, velocity: 80 })) }} />
  )
  expect(viewport.scrollTop).toBe(500)
})

it("writes the fit scroll only after the fitted row height is committed to the DOM", () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(127)
  const writes: { rowHeight: number; scrollTop: number }[] = []
  const setScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")?.set
  if (!setScrollTop) throw new Error("Missing DOM scrollTop setter")
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (
    this: Element,
    value: number
  ) {
    setScrollTop.call(this, value)
    if (this instanceof HTMLElement && this.dataset.testid === "viewport") {
      writes.push({ rowHeight: Number(this.dataset.rowHeight), scrollTop: value })
    }
  })
  const view = render(<Viewport source={clip} />)
  const viewport = view.getByTestId("viewport")
  expect(writes.length).toBeGreaterThan(0)
  expect(writes.every(write => write.rowHeight === 8)).toBe(true)
  const rowHeight = Number(viewport.dataset.rowHeight)
  expect(RULER_HEIGHT + (127 - 67) * rowHeight - viewport.scrollTop).toBeGreaterThanOrEqual(
    RULER_HEIGHT
  )
  expect(RULER_HEIGHT + (127 - 60 + 1) * rowHeight - viewport.scrollTop).toBeLessThanOrEqual(127)
})

it("fits a changed source window once and then preserves user scrolling during edits", () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(127)
  const source: MidiClip = {
    ...clip,
    notes: [
      ...clip.notes,
      {
        id: "retained-high",
        pitch: 80,
        startBeat: 8,
        lengthBeats: 1,
        velocity: 90,
      },
    ],
  }
  const view = render(<Viewport source={source} />)
  const viewport = view.getByTestId("viewport")
  expect(viewport.dataset.rowHeight).toBe("8")
  const shifted = { ...source, sourceOffsetBars: 2 }
  view.rerender(<Viewport source={shifted} />)
  const rowHeight = Number(viewport.dataset.rowHeight)
  const noteTop = RULER_HEIGHT + (127 - 80) * rowHeight - viewport.scrollTop
  expect(noteTop).toBeGreaterThanOrEqual(RULER_HEIGHT)
  expect(noteTop + rowHeight).toBeLessThanOrEqual(127)
  viewport.scrollTop = 600
  view.rerender(
    <Viewport
      source={{ ...shifted, notes: shifted.notes.map(note => ({ ...note, velocity: 80 })) }}
    />
  )
  expect(viewport.scrollTop).toBe(600)
})
