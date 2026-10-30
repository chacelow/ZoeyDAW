import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { ClipDetail } from "."
import { AudioWaveform } from "./AudioEditor/Waveform"
import { getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import type { MediaSource } from "@zoeydaw/project-core/media"
import type { WaveformRange } from "@zoeydaw/project-core/waveform-range"
import * as waveformRanges from "@/pages/project/adapters/backend/waveform-ranges"
import { useNativeWaveforms } from "@/pages/project/adapters/backend/waveforms"
import type { RenderResult } from "@testing-library/react"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import { cancelDrawModeKey } from "@/pages/project/sections/ArrangementPanel/Timeline/drawModeKey"

function Editor() {
  const clip = useProjectState(s =>
    s.document.tracks.flatMap(track => track.clips).find(item => item.id === "pattern-test")
  )
  return clip ? <ClipDetail clip={clip} /> : null
}

function AudioFixtureEditor() {
  const clip = useProjectState(state =>
    state.document.tracks.flatMap(track => track.clips).find(item => item.id === "audio-1")
  )
  return clip ? <ClipDetail clip={clip} /> : null
}

function patternClip(id = "pattern-test") {
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === id)
  if (!clip || clip.kind !== "pattern") throw new Error("Missing pattern fixture")
  return clip
}

function patternSource(id = "pattern-test") {
  return resolveMidiClip(patternClip(id), useProjectState.getState().document.patterns)
}

function prepareDraw(view: RenderResult) {
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
  })
  grid.focus()
  fireEvent.keyDown(grid, { key: "b" })
  return grid
}

function drawStart(grid: HTMLElement) {
  fireEvent.pointerDown(grid, {
    button: 0,
    pointerId: 1,
    clientX: 12.5,
    clientY: (127 - 70 + 0.5) * 18,
  })
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(item => item.id === "trager")
  if (!track) {
    throw new Error("Missing MIDI track")
  }
  document.patterns.push({ id: "shared-test", notes: [], loopBars: 1 })
  track.clips.push(
    { id: "pattern-test", kind: "pattern", patternId: "shared-test", startBar: 1, lengthBars: 1 },
    { id: "pattern-linked", kind: "pattern", patternId: "shared-test", startBar: 8, lengthBars: 2 }
  )
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  cleanup()
  cancelDrawModeKey()
  waveformRanges.useWaveformRanges.setState({ entries: new Map() })
  useNativeWaveforms.setState({ entries: {} })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture")
  Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture")
  Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture")
})

for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
  it(`keeps the live name gesture open during composition (${JSON.stringify(composition)})`, () => {
    const view = render(<Editor />)
    const input = view.container.querySelector<HTMLInputElement>("[data-clip-name]")
    if (!input) throw new Error("Missing Clip name field")
    act(() => input.focus())
    fireEvent.change(input, { target: { value: "主唱" } })
    for (const key of ["Enter", "Escape"]) {
      expect(fireEvent.keyDown(input, { key, ...composition })).toBe(true)
      expect(document.activeElement).toBe(input)
      expect(patternClip().label).toBe("主唱")
    }
    fireEvent.keyDown(input, { key: "Enter" })
    expect(document.activeElement).not.toBe(input)
    expect(patternClip().label).toBe("主唱")
    act(() => projectActions.undo())
    expect(patternClip().label).toBeUndefined()
  })
}

for (const end of ["lostpointercapture", "blur", "unmount", "escape"] as const) {
  it(`rolls back shared notes and keeps later undo working after ${end}`, () => {
    const view = render(<Editor />)
    const grid = prepareDraw(view)
    drawStart(grid)
    expect(patternSource().notes).toHaveLength(1)
    expect(patternSource("pattern-linked").notes).toBe(patternSource().notes)
    if (end === "unmount") view.unmount()
    else if (end === "blur") fireEvent(window, new Event("blur"))
    else if (end === "escape") fireEvent.keyDown(window, { key: "Escape" })
    else fireEvent.lostPointerCapture(grid, { pointerId: 1 })
    expect(patternSource().notes).toEqual([])
    expect(patternSource("pattern-linked").notes).toEqual([])
    expect(useProjectState.getState().session.canUndo).toBe(false)
    projectActions.setBpm(140)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  })
}

it("draws genuine shared notes across multiple moves as one undoable gesture", () => {
  const view = render(<Editor />)
  const grid = prepareDraw(view)
  drawStart(grid)
  for (const clientX of [137.5, 225]) {
    fireEvent.pointerMove(grid, { pointerId: 1, clientX, clientY: (127 - 70 + 0.5) * 18 })
  }
  fireEvent.pointerUp(grid, { pointerId: 1 })
  expect(patternSource().notes.map(note => note.startBeat)).toEqual(
    Array.from({ length: 10 }, (_, index) => index / 4)
  )
  expect(patternSource().notes.every(note => note.pitch === 70 && note.lengthBeats === 0.25)).toBe(
    true
  )
  expect(patternSource("pattern-linked").notes).toBe(patternSource().notes)
  expect(patternClip("pattern-linked")).toMatchObject({ startBar: 8, lengthBars: 2 })
  expect(patternClip()).not.toHaveProperty("notes")
  expect(view.container.querySelector("[data-step-index]")).toBeNull()
  projectActions.undo()
  expect(patternSource().notes).toEqual([])
  expect(patternSource("pattern-linked").notes).toEqual([])
  expect(useProjectState.getState().session.canUndo).toBe(false)
  projectActions.redo()
  expect(patternSource("pattern-linked").notes).toHaveLength(10)
})

it("keeps shared source notes while trimming only the edited placement", () => {
  projectActions.updateClip("pattern-test", {
    notes: [{ id: "partial", pitch: 60, startBeat: 0.25, lengthBeats: 0.25, velocity: 100 }],
    sourceOffsetBars: 0.1,
    lengthBars: 0.9,
    mute: true,
  })
  const view = render(<Editor />)
  expect(view.container.querySelector('[data-note-index="0"]')).not.toBeNull()
  expect(patternClip().mute).toBe(true)
  expect(patternSource("pattern-linked").notes).toBe(patternSource().notes)
  expect(patternClip("pattern-linked")).toMatchObject({ startBar: 8, lengthBars: 2 })
  expect(patternClip("pattern-linked").sourceOffsetBars).toBeUndefined()
  expect(patternClip("pattern-linked").mute).toBeUndefined()
  projectActions.undo()
  expect(patternSource("pattern-linked").notes).toEqual([])
  expect(patternClip().lengthBars).toBe(1)
  expect(patternClip().sourceOffsetBars).toBeUndefined()
})

it("edits the shared loop through existing MIDI controls without changing placement", () => {
  const view = render(<Editor />)
  fireEvent.change(view.getByRole("spinbutton", { name: "detailMidi.loopBars" }), {
    target: { value: "2" },
  })
  expect(patternSource().loopBars).toBe(2)
  expect(patternSource("pattern-linked").loopBars).toBe(2)
  expect(patternClip().lengthBars).toBe(1)
  expect(patternClip()).not.toHaveProperty("loopBars")
  projectActions.undo()
  expect(patternSource("pattern-linked").loopBars).toBe(1)
})

it("shows and edits shared Clip properties before MIDI-only settings", () => {
  const view = render(<Editor />)
  expect(view.getByText("detailMidi.clip")).toBeTruthy()
  expect(view.getByRole("button", { name: "detailMidi.start" })).toBeTruthy()
  expect(view.getByText("detailMidi.end")).toBeTruthy()
  expect(view.getByRole("button", { name: "detailMidi.signature" })).toBeTruthy()
  expect(view.getByRole("button", { name: "detailMidi.groove" })).toBeTruthy()
  expect(view.getByRole("combobox", { name: "detailMidi.signatureDenominator" })).toBeTruthy()
  expect(view.getByRole("spinbutton", { name: "detailMidi.loopBars" })).toBeTruthy()

  fireEvent.change(view.getByRole("combobox", { name: "detailMidi.signatureDenominator" }), {
    target: { value: "8" },
  })
  expect(patternClip().signatureDenominator).toBe(8)
})

it("edits one shared source rather than allocating repeat notes for a long Pattern clip", () => {
  projectActions.updateClip("pattern-test", {
    lengthBars: 4,
    notes: [{ id: "source", pitch: 60, startBeat: 0, lengthBeats: 0.25, velocity: 100 }],
  })
  const view = render(<Editor />)
  expect(view.container.querySelectorAll("[data-note-index]")).toHaveLength(1)
  expect(patternSource("pattern-linked").notes).toHaveLength(1)
})

it("routes shared-note undo and redo from detail without consuming text-field undo", () => {
  const view = render(<Editor />)
  const grid = prepareDraw(view)
  drawStart(grid)
  fireEvent.pointerUp(grid, { pointerId: 1 })
  const editor = view.getByRole("region", { name: "arrangement.clipEditor" })
  fireEvent.keyDown(editor, { key: "z", metaKey: true })
  expect(patternSource("pattern-linked").notes).toEqual([])
  fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true })
  expect(patternSource("pattern-linked").notes).toHaveLength(1)
  const input = view.container.querySelector<HTMLInputElement>("[data-clip-name]")
  if (!input) throw new Error("Missing Clip name field")
  expect(fireEvent.keyDown(input, { key: "z", metaKey: true })).toBe(true)
  expect(patternSource("pattern-linked").notes).toHaveLength(1)
})

it("allows shared pre-edit typing to author a musical Audio loop position", () => {
  const view = render(<AudioFixtureEditor />)
  const button = view.getByRole("button", { name: "detailAudio.loopPosition" })
  button.focus()
  fireEvent.click(button, { detail: 0 })
  fireEvent.keyDown(button, { key: "3", code: "Digit3" })
  const input = view.getByRole("textbox", { name: "detailAudio.loopPosition" })
  fireEvent.change(input, { target: { value: "3.1.1" } })
  fireEvent.keyDown(input, { key: "Enter" })
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === "audio-1")
  if (clip?.kind !== "audio") throw new Error("Missing Audio fixture")
  expect(clip.audioSettings?.loopStartBars).toBe(2)
  expect(clip.sourceOffsetBars ?? 0).toBe(0)
  fireEvent.keyDown(view.getByRole("button", { name: "detailAudio.loopPosition" }), {
    key: "z",
    metaKey: true,
  })
  const restored = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === "audio-1")
  if (restored?.kind !== "audio") throw new Error("Missing restored Audio fixture")
  expect(restored.audioSettings).toBeUndefined()
})

it("allows warping an audio clip directly and restores unknown on undo", () => {
  const original = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.id === "audio-1")
  if (original?.kind !== "audio") throw new Error("Missing Audio fixture")
  act(() =>
    projectActions.updateClip(original.id, {
      sourceTempo: "unknown",
      audioSettings: { ...getAudioClipSettings(original, 120), warp: false },
    })
  )
  const view = render(<AudioFixtureEditor />)
  const warp = view.getByRole("button", { name: "detailAudio.warp" })
  expect(warp.hasAttribute("disabled")).toBe(false)
  const source = view.getByRole("button", { name: "detailAudio.sourceBpm" })
  expect(source.textContent).toContain("detailAudio.unknownTempo")

  // Clicking warp directly enables warp and clears unknown
  fireEvent.click(warp)
  const read = () =>
    useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(clip => clip.id === original.id)
  expect(read()).toMatchObject({ sourceTempo: undefined, audioSettings: { warp: true } })
  act(() => projectActions.undo())
  expect(read()).toMatchObject({ sourceTempo: "unknown", audioSettings: { warp: false } })
  expect(view.getByRole("button", { name: "detailAudio.sourceBpm" }).textContent).toContain(
    "detailAudio.unknownTempo"
  )
})

it("resolves a stale clip prop against its live owner for title and titlebar color", () => {
  const owner = useProjectState.getState().document.tracks.find(track => track.id === "trager")
  const original = owner?.clips.find(clip => clip.id === "pattern-test")
  if (!original || !owner) throw new Error("Missing Pattern owner")
  const view = render(<ClipDetail clip={original} />)
  const titlebar = view.container.querySelector("[data-clip-editor-titlebar]")
  expect(titlebar?.getAttribute("data-title-color")).toBe(owner.color)
  act(() => projectActions.updateTrack(owner.id, { color: "var(--chart-4)" }))
  expect(titlebar?.getAttribute("data-title-color")).toBe("var(--chart-4)")
  act(() =>
    projectActions.updateClip(original.id, { label: "Live Pattern", color: "var(--chart-2)" })
  )
  expect(titlebar?.getAttribute("data-title-color")).toBe("var(--chart-2)")
  const input = view.container.querySelector<HTMLInputElement>("[data-clip-name]")
  expect(input?.value).toBe("Live Pattern")
  act(() => projectActions.updateTrack(owner.id, { color: "var(--chart-5)" }))
  expect(titlebar?.getAttribute("data-title-color")).toBe("var(--chart-2)")
  act(() => projectActions.updateClip(original.id, { color: undefined }))
  expect(titlebar?.getAttribute("data-title-color")).toBe("var(--chart-5)")
})

it("switches the selected source to exactly one editor and drops old name input state", () => {
  const clips = useProjectState.getState().document.tracks.flatMap(track => track.clips)
  const pattern = clips.find(clip => clip.id === "pattern-test")
  const midi = clips.find(clip => clip.kind === "midi")
  const audio = clips.find(clip => clip.kind === "audio")
  if (!pattern || !midi || !audio) throw new Error("Missing source fixtures")
  const view = render(<ClipDetail clip={pattern} />)
  expect(view.container.querySelectorAll("[data-midi-editor]")).toHaveLength(1)
  expect(view.container.querySelector("[data-step-index]")).toBeNull()
  view.rerender(<ClipDetail clip={midi} />)
  expect(view.container.querySelectorAll("[data-midi-editor]")).toHaveLength(1)
  expect(view.container.querySelector("[data-step-index]")).toBeNull()
  view.rerender(<ClipDetail clip={audio} />)
  expect(view.container.querySelector("[data-audio-waveform-surface]")).not.toBeNull()
})
it("switches the audio inspector between compact and wide layouts", () => {
  const view = render(<AudioFixtureEditor />)
  expect(view.getByRole("button", { name: "detailAudio.audioSection" })).toBeTruthy()
  expect(view.queryByRole("tab", { name: "detailAudio.clipSection" })).toBeNull()
  const handle = view.getByRole("separator", { name: "Switch audio inspector layout" })
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 130 })
  expect(view.getByRole("tab", { name: "detailAudio.clipSection" })).toBeTruthy()
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 130 })
  fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 130 })
  fireEvent.pointerMove(handle, { pointerId: 2, clientX: 90 })
  expect(view.queryByRole("tab", { name: "detailAudio.clipSection" })).toBeNull()
})

it("repaints both real-source projections with signed filled contours across zoom levels", () => {
  const demand = vi.spyOn(waveformRanges, "setWaveformRangeDemand").mockImplementation(() => {})
  const release = vi.spyOn(waveformRanges, "releaseWaveformRangeDemand")
  const source = {
    id: "editor-real-source",
    name: "stereo.wav",
    sha256: "a".repeat(64),
    byteLength: 1_536_000,
    frames: 384_000,
    sampleRate: 48_000,
    channels: 2,
    location: { kind: "external", path: "/audio/stereo.wav" },
  } satisfies MediaSource
  const document = useProjectState.getState().document
  const fixture = document.tracks.flatMap(track => track.clips).find(clip => clip.id === "audio-1")
  if (fixture?.kind !== "audio") throw new Error("Missing Audio fixture")
  const clip = {
    ...fixture,
    sourceId: source.id,
    sourceOffsetBars: 0,
    lengthBars: 4,
    waveformPeaks: [1, 1, 1],
    audioSettings: {
      ...getAudioClipSettings(fixture, 120),
      sourceBpm: 120,
      startMarkerBars: 0,
      endMarkerBars: 4,
      loopStartBars: 0,
      loopLengthBars: 4,
    },
  }
  hydrateProject(
    JSON.stringify({
      version: 4,
      document: { ...document, media: [...document.media, source] },
      workspace: useProjectState.getState().workspace,
    })
  )
  const view = render(<AudioWaveform clip={clip} transport={document.transport} />)
  const mainPaths = () =>
    Array.from(
      view.container.querySelectorAll<SVGPathElement>(".audio-detail-wave-svg .audio-detail-peak")
    )
  expect(mainPaths()).toHaveLength(0)
  expect(view.container.querySelectorAll(".audio-detail-overview .audio-detail-peak")).toHaveLength(
    0
  )
  const initialDemand = demand.mock.calls.at(-1)
  if (!initialDemand) throw new Error("Missing initial editor range demand")
  const envelopes = initialDemand[1].map(({ request }) => {
    const bins = Math.ceil(request.frameCount / request.framesPerBin)
    return {
      kind: "envelope",
      sampleRate: source.sampleRate,
      totalFrames: source.frames,
      startFrame: request.startFrame,
      frameCount: request.frameCount,
      framesPerBin: request.framesPerBin,
      channels: [
        {
          min: Array.from({ length: bins }, (_, index) => (index % 2 ? -0.6 : -0.9)),
          max: Array.from({ length: bins }, () => -0.1),
        },
        {
          min: Array.from({ length: bins }, () => 0.1),
          max: Array.from({ length: bins }, (_, index) => (index % 2 ? 0.7 : 0.9)),
        },
      ],
    } satisfies WaveformRange
  })
  act(() =>
    waveformRanges.useWaveformRanges.setState({
      entries: new Map([
        [
          "unrelated-envelope",
          { kind: "ready", range: { sourceKey: "unrelated-source", data: envelopes[0] } },
        ],
      ]),
    })
  )
  expect(mainPaths()).toHaveLength(0)
  expect(view.container.querySelectorAll(".audio-detail-overview .audio-detail-peak")).toHaveLength(
    0
  )
  const sourceKey = waveformRanges.sourceWaveformKey(source)
  act(() => {
    const entries = new Map(waveformRanges.useWaveformRanges.getState().entries)
    envelopes.forEach((data, index) =>
      entries.set(`editor-envelope/${index}`, {
        kind: "ready",
        range: { sourceKey, data },
      })
    )
    waveformRanges.useWaveformRanges.setState({ entries })
  })
  const assertSignedContours = () => {
    for (const selector of [".audio-detail-wave-svg", ".audio-detail-overview"]) {
      const paths = Array.from(
        view.container.querySelectorAll<SVGPathElement>(`${selector} .audio-detail-peak`)
      )
      expect(paths).toHaveLength(2)
      expect(paths[0].getAttribute("d")).not.toBe(paths[1].getAttribute("d"))
      for (const path of paths) {
        expect(path.getAttribute("d")).toMatch(/^M.*Z$/i)
        expect(path.style.fill).toBe("var(--foreground)")
      }
    }
  }
  assertSignedContours()
  const previousPath = mainPaths()[0].getAttribute("d")
  for (let index = 0; index < 20; index++) {
    fireEvent.click(view.getByRole("button", { name: "detailAudio.zoomIn" }))
  }
  const latest = demand.mock.calls.at(-1)
  if (!latest) throw new Error("Missing editor range demand")
  const [visible, overview] = latest[1]
  expect(visible.request.frameCount).toBeLessThan(overview.request.frameCount)
  expect(overview.request.startFrame).toBe(0)
  expect(overview.request.frameCount).toBe(source.frames)
  const metadata = {
    sampleRate: source.sampleRate,
    totalFrames: source.frames,
    startFrame: visible.request.startFrame,
    frameCount: visible.request.frameCount,
  }
  const bins = Math.ceil(visible.request.frameCount / visible.request.framesPerBin)
  const zoomedRange: WaveformRange =
    visible.request.framesPerBin === 1
      ? {
          ...metadata,
          kind: "samples",
          channels: [
            Array.from({ length: visible.request.frameCount }, (_, index) =>
              index % 2 ? -0.2 : -0.9
            ),
            Array.from({ length: visible.request.frameCount }, (_, index) =>
              index % 2 ? 0.8 : 0.1
            ),
          ],
        }
      : {
          ...metadata,
          kind: "envelope",
          framesPerBin: visible.request.framesPerBin,
          channels: [
            {
              min: Array.from({ length: bins }, () => -0.9),
              max: Array.from({ length: bins }, (_, index) => (index % 2 ? -0.2 : -0.4)),
            },
            {
              min: Array.from({ length: bins }, (_, index) => (index % 2 ? 0.1 : 0.3)),
              max: Array.from({ length: bins }, () => 0.8),
            },
          ],
        }
  act(() =>
    waveformRanges.useWaveformRanges.setState({
      entries: new Map(waveformRanges.useWaveformRanges.getState().entries).set("editor-zoomed", {
        kind: "ready",
        range: { sourceKey, data: zoomedRange },
      }),
    })
  )
  expect(mainPaths()[0].getAttribute("d")).not.toBe(previousPath)
  expect(mainPaths()[0].getAttribute("d")?.match(/M/g)).toHaveLength(1)
  assertSignedContours()
  const waveSvg = view.container.querySelector<SVGSVGElement>(".audio-detail-wave-svg")
  if (!waveSvg) throw new Error("Missing waveform SVG")
  const [x, y, width] = waveSvg.getAttribute("viewBox")!.split(" ").map(Number)
  expect(x).toBe(0)
  expect(y).toBe(0)
  expect(width).toBeGreaterThan(100)
  const projectedGroup = mainPaths()[0].parentElement
  expect(projectedGroup?.getAttribute("transform")).toBeNull()
  view.unmount()
  expect(release).toHaveBeenLastCalledWith(`audio-editor/${clip.id}`)
})

it("projects non-warped fades and Fit into source bars with a shifted start marker", () => {
  const document = useProjectState.getState().document
  const fixture = document.tracks.flatMap(track => track.clips).find(clip => clip.id === "audio-1")
  if (fixture?.kind !== "audio") throw new Error("Missing Audio fixture")
  const source = {
    id: "source-projection-test",
    name: "long.wav",
    sha256: "b".repeat(64),
    byteLength: 1_920_000,
    frames: 480_000,
    sampleRate: 48_000,
    channels: 2,
    location: { kind: "external", path: "/audio/long.wav" },
  } satisfies MediaSource
  const clip = {
    ...fixture,
    sourceId: source.id,
    sourceOffsetBars: 1,
    lengthBars: 2,
    fadeInBars: 0.5,
    fadeOutBars: 0.5,
    audioSettings: {
      ...getAudioClipSettings(fixture, document.transport.bpm),
      warp: false,
      sourceBpm: document.transport.bpm * 2,
      startMarkerBars: 2,
      endMarkerBars: 5,
      loopStartBars: 2,
      loopLengthBars: 3,
    },
  }
  hydrateProject(
    JSON.stringify({
      version: 4,
      document: {
        ...document,
        media: [...document.media, source],
        tracks: document.tracks.map(track => ({
          ...track,
          clips: track.clips.map(item => (item.id === clip.id ? clip : item)),
        })),
      },
      workspace: useProjectState.getState().workspace,
    })
  )
  const liveClip = () =>
    useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(item => item.id === clip.id)
  function LiveWaveform() {
    const current = useProjectState(state =>
      state.document.tracks.flatMap(track => track.clips).find(item => item.id === clip.id)
    )
    if (current?.kind !== "audio") return null
    return <AudioWaveform clip={current} transport={document.transport} />
  }
  const view = render(<LiveWaveform />)
  const fadeIn = view.container.querySelector<HTMLButtonElement>('[data-kind="fadeIn"]')
  expect(fadeIn?.style.left).toBe("30%")
  const fadeOut = view.container.querySelector<HTMLButtonElement>('[data-kind="fadeOut"]')
  expect(fadeOut?.style.left).toBe("50%")
  if (!fadeIn || !fadeOut) throw new Error("Missing fade markers")
  Object.defineProperty(fadeIn.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width: 100 }),
  })
  fireEvent.pointerDown(fadeIn, { button: 0, pointerId: 1, clientX: 30 })
  fireEvent.pointerMove(fadeIn, { pointerId: 1, clientX: 40 })
  expect(liveClip()).toMatchObject({ fadeInBars: 1 })
  fireEvent.pointerUp(fadeIn, { pointerId: 1, clientX: 40 })
  act(() => projectActions.undo())
  expect(liveClip()).toMatchObject({ fadeInBars: 0.5 })
  act(() =>
    projectActions.updateClip(clip.id, {
      audioSettings: { ...clip.audioSettings, startMarkerBars: 3 },
    })
  )
  expect(view.container.querySelector<HTMLButtonElement>('[data-kind="fadeIn"]')?.style.left).toBe(
    "40%"
  )
  fireEvent.click(view.getByRole("button", { name: "detailAudio.zoomIn" }))
  fireEvent.click(view.getByRole("button", { name: "detailAudio.fit" }))
  const sourceSvg = view.container.querySelectorAll(".audio-detail-wave-svg svg[viewBox]")[0]
  expect(sourceSvg?.getAttribute("viewBox")).toBe("0 0 10 100")
  expect(view.container.querySelector("[data-kind='start']")?.getAttribute("style")).toContain(
    "30%"
  )
})

it("edits stable Warp markers through the Audio editor with undo and redo", () => {
  const view = render(<AudioFixtureEditor />)
  fireEvent.click(view.getByRole("button", { name: "detailAudio.addWarpMarker" }))
  const points = () => {
    const clip = useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(item => item.id === "audio-1")
    return clip?.kind === "audio" ? clip.audioSettings?.warpMarkers : undefined
  }
  const added = points()
  expect(added?.[0]).toMatchObject({ sourceBar: 1, targetBar: 1 })
  const field = view.getByLabelText("detailAudio.warpTarget 1")
  fireEvent.click(field)
  fireEvent.keyDown(document, { key: "0" })
  const input = view.getByRole("textbox", { name: "detailAudio.warpTarget 1" })
  fireEvent.change(input, { target: { value: "0.5" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(points()?.[0]).toEqual({ ...added?.[0], targetBar: 0.5 })
  act(() => projectActions.undo())
  expect(points()).toEqual(added)
  act(() => projectActions.redo())
  expect(points()?.[0].targetBar).toBe(0.5)
  fireEvent.click(view.getByRole("button", { name: "detailAudio.removeWarpMarker 1" }))
  expect(points()).toEqual([])
  act(() => projectActions.undo())
  expect(points()?.[0].targetBar).toBe(0.5)
})

it("drags a Warp marker and keeps the change undoable", () => {
  const view = render(<AudioFixtureEditor />)
  fireEvent.click(view.getByRole("button", { name: "detailAudio.addWarpMarker" }))
  const handle = view.getByRole("button", { name: "detailAudio.warpMarker 1" })
  const parent = handle.parentElement
  if (!parent) throw new Error("Missing Warp marker ruler")
  Object.defineProperty(parent, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 400, height: 20 }),
  })
  const point = () => {
    const clip = useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(item => item.id === "audio-1")
    return clip?.kind === "audio" ? clip.audioSettings?.warpMarkers?.[0] : undefined
  }
  const initial = point()
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 120 })
  const moved = point()
  expect(moved?.targetBar).not.toBe(initial?.targetBar)
  expect(moved?.sourceBar).toBe(initial?.sourceBar)
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 120 })
  act(() => projectActions.undo())
  expect(point()).toEqual(initial)
  act(() => projectActions.redo())
  expect(point()).toEqual(moved)
})

it("turns a detected source transient into an undoable Warp marker", () => {
  vi.spyOn(waveformRanges, "setWaveformRangeDemand").mockImplementation(() => {})
  const source = {
    id: "transient-source",
    name: "attacks.wav",
    sha256: "a".repeat(64),
    byteLength: 102400,
    frames: 51200,
    sampleRate: 48000,
    channels: 1,
    location: { kind: "external", path: "/audio/attacks.wav" },
  } satisfies MediaSource
  const document = useProjectState.getState().document
  const tracks = document.tracks.map(track => ({
    ...track,
    clips: track.clips.map(clip =>
      clip.id === "audio-1" && clip.kind === "audio"
        ? {
            ...clip,
            sourceId: source.id,
            audioSettings: { ...getAudioClipSettings(clip, 120), warp: true },
          }
        : clip
    ),
  }))
  hydrateProject(
    JSON.stringify({
      version: 4,
      document: { ...document, tracks, media: [...document.media, source] },
      workspace: useProjectState.getState().workspace,
    })
  )
  const peaks = Array.from({ length: 100 }, (_, index) => (index === 10 ? 0.8 : 0))
  useNativeWaveforms.setState({
    entries: {
      [`${source.id}/${source.sha256}/${source.location.path}`]: {
        kind: "ready",
        peaks,
        durationSeconds: source.frames / source.sampleRate,
      },
    },
  })
  const view = render(<AudioFixtureEditor />)
  const handle = view.getByRole("button", { name: "detailAudio.warpMarker 1" })
  if (!handle.parentElement) throw new Error("Missing Warp marker ruler")
  Object.defineProperty(handle.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 400, height: 20 }),
  })
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 120 })
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 120 })
  const points = () => {
    const clip = useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(item => item.id === "audio-1")
    return clip?.kind === "audio" ? clip.audioSettings?.warpMarkers : undefined
  }
  expect(points()?.[0]?.sourceBar).toBeCloseTo(5120 / 48000 / 2)
  expect(points()?.[0]?.targetBar).toBeGreaterThan(points()?.[0]?.sourceBar ?? 0)
  act(() => projectActions.undo())
  expect(points() ?? []).toEqual([])
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === "audio-1")
  if (!clip || clip.kind !== "audio") throw new Error("Missing audio clip")
  act(() =>
    projectActions.updateClip(clip.id, {
      audioSettings: { ...getAudioClipSettings(clip, 120), warp: false },
    })
  )
  expect(
    view.getByRole("button", { name: "detailAudio.warpMarker 1" }).hasAttribute("disabled")
  ).toBe(true)
})
