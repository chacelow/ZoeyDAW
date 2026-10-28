import { expect, it } from "vitest"
import { initialDocument } from "@zoeydaw/project-runtime/state"
import { createTrack } from "@zoeydaw/project-core/reducers"
import { DEFAULT_GRID } from "@zoeydaw/project-core/grid"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { arrangementBodyTop, pinnedTopFor, dropZoneTop } from "../canvas/layout"
import { createSceneStore } from "../canvas/scene"
import { browserAudioPlacement } from "./browser-audio-placement"
import type { BrowserAudioDragSource } from "@/pages/project/adapters/browser"

const source: BrowserAudioDragSource = {
  token: "drag",
  path: "/Voice.wav",
  name: "Voice.wav",
  durationSeconds: 5,
}
function setup() {
  const document = initialDocument(DEFAULT_TRACK_HEIGHT)
  const store = createSceneStore()
  store.setMusic({ ...document, loop: document.transport.loop, bars: 128, grid: DEFAULT_GRID })
  store.setViewport({ width: 500, height: 700, scrollX: 100, scrollY: 0, pxPerBar: 100, dpr: 1 })
  const scene = store.get()
  return { ...scene, gridPlan: { ...scene.gridPlan, cellBars: 0.25 } }
}

it("uses the shared grid and horizontal scroll for an Audio target", () => {
  const scene = setup()
  const audio = scene.tracks.find(track => track.kind === "audio")!
  expect(
    browserAudioPlacement(scene, { x: 32, y: arrangementBodyTop() + 5 }, true, source)
  ).toMatchObject({ trackId: audio.id, startBar: 2.25, left: 25, width: 250, color: audio.color })
  expect(
    browserAudioPlacement(scene, { x: 32, y: arrangementBodyTop() + 5 }, false, source)?.startBar
  ).toBeCloseTo(2.32)
})

it("clips a vertically scrolled Audio ghost to the visible lane", () => {
  const base = setup()
  const scene = { ...base, viewport: { ...base.viewport, scrollY: 30 } }
  const target = browserAudioPlacement(scene, { x: 10, y: arrangementBodyTop() + 5 }, true, source)
  expect(target?.top).toBe(arrangementBodyTop())
  expect(target?.height).toBe(DEFAULT_TRACK_HEIGHT - 30)
})

it.each(["group", "return"])("rejects %s track rows", kind => {
  const scene = setup()
  const track = createTrack(
    kind === "group" ? "group" : "return",
    [...scene.tracks],
    undefined,
    DEFAULT_TRACK_HEIGHT
  )
  const tracks = [track, ...scene.tracks.filter(track => track.kind === "main")]
  const next = { ...scene, tracks }
  const y =
    kind === "return" ? pinnedTopFor(tracks, next.viewport.height) + 1 : arrangementBodyTop() + 1
  expect(browserAudioPlacement(next, { x: 10, y }, true, source)).toBeNull()
})

it("accepts a MIDI lane without mutating its kind or authored clips during preview", () => {
  const scene = setup()
  const midi = createTrack("midi", [...scene.tracks], undefined, DEFAULT_TRACK_HEIGHT)
  const next = { ...scene, tracks: [midi, ...scene.tracks.filter(track => track.kind === "main")] }
  const before = structuredClone(next.tracks)
  expect(
    browserAudioPlacement(next, { x: 10, y: arrangementBodyTop() + 5 }, true, source)
  ).toMatchObject({ trackId: midi.id, color: midi.color })
  expect(next.tracks).toEqual(before)
})

it("rejects rulers, track headers, Main and pinned-overlapping ordinary rows", () => {
  const scene = setup()
  for (const point of [
    { x: 10, y: 10 },
    { x: 501, y: 80 },
    { x: -1, y: 80 },
    { x: 10, y: 699 },
    { x: 10, y: pinnedTopFor(scene.tracks, 700) + 1 },
  ])
    expect(browserAudioPlacement(scene, point, true, source)).toBeNull()
  const next = {
    ...scene,
    tracks: scene.tracks.map(track =>
      track.kind === "audio" ? { ...track, heightPx: 900 } : track
    ),
  }
  expect(
    browserAudioPlacement(next, { x: 10, y: pinnedTopFor(next.tracks, 700) + 1 }, true, source)
  ).toBeNull()
})

it("anchors empty-area placement to a new-track row, never a selected-track fallback", () => {
  const scene = setup()
  const top = dropZoneTop(scene.tracks, 0)
  const target = browserAudioPlacement(scene, { x: 10, y: top + 30 }, true, source)
  expect(target).toMatchObject({ trackId: undefined, top, height: DEFAULT_TRACK_HEIGHT })
  expect(browserAudioPlacement(scene, { x: 10, y: top + 80 }, true, source)).toEqual(target)
})

it.each([60, 120, 200])("projects only measured source duration at project BPM %s", bpm => {
  const scene = setup()
  const next = { ...scene, transport: { ...scene.transport, bpm } }
  expect(
    browserAudioPlacement(next, { x: 10, y: arrangementBodyTop() + 5 }, true, source)?.width
  ).toBeCloseTo(((5 * bpm) / 240) * 100)
  expect(
    browserAudioPlacement(next, { x: 10, y: arrangementBodyTop() + 5 }, true, {
      ...source,
      durationSeconds: null,
    })?.width
  ).toBeNull()
})

it("computes warped width during drag preview for audio files with filename BPM", () => {
  const scene = setup()
  const bpmSource: BrowserAudioDragSource = {
    ...source,
    name: "Cymatics - Bang Full Drum Loop 2 - 121 BPM.wav",
    durationSeconds: 8,
  }
  const target = browserAudioPlacement(
    scene,
    { x: 10, y: arrangementBodyTop() + 5 },
    true,
    bpmSource
  )
  const expectedWarpedBars = (8 * 121) / 240
  expect(target?.width).toBeCloseTo(expectedWarpedBars * scene.viewport.pxPerBar)
})
