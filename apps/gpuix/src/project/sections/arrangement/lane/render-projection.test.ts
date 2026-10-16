import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { expect, it } from "bun:test"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { createMockDocument } from "../../../adapters/fixtures"
import type { Clip, MidiClip } from "../../../model/types"
import { clipRect, layoutTrackRows } from "../core/layout"
import { clipVisualGeometry } from "../core/clip-geometry"
import { createSceneStore } from "../core/scene"
import {
  clipLoopTicks,
  midiPreviewRects,
  patternPreviewRects,
  visibleClipCards,
  visibleRows,
} from "./render-projection"
import { gridLines } from "../core/rulers/grid-lines"
import { createClipCardProjection } from "./clip-card-projection"

it("keeps Clip-local grids phase-aligned across fractional viewports and vertical-only motion", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  track.clips = [
    {
      kind: "pattern",
      id: "grid-phase",
      patternId: "p",
      startBar: 3.5,
      lengthBars: 2,
      steps: [true],
    },
  ]
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: [track],
    markers: [],
    loop: score.transport.loop,
  })
  const project = createClipCardProjection()
  let seed = 0x93ab2
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
  for (let sample = 0; sample < 200; sample++) {
    scene.setViewport({
      width: 500 + random(),
      height: 300,
      scrollX: sample === 0 ? 0.2 : random() * 8,
      scrollY: 0,
      pxPerBar: sample === 0 ? 8 : 8 + random() * 128,
      dpr: 1,
    })
    const row = layoutTrackRows(scene.get())[0]
    if (!row) throw new Error("Missing projected track")
    const localRow = { ...row, top: 0 }
    const card = project(scene.get(), localRow, false)[0]
    if (!card) throw new Error("Missing visible grid Clip")
    const left = Math.max(0, card.geometry.left)
    const right = Math.min(scene.get().viewport.width, card.geometry.left + card.geometry.width)
    const inside = (line: { x: number }) => line.x >= left && line.x < right
    expect(card.grid.every(line => line.x >= Math.max(0, left - 1) && line.x < right + 1)).toBe(
      true
    )
    expect(card.grid.filter(inside)).toEqual(gridLines(scene.get()).filter(inside))
    scene.setViewport({ ...scene.get().viewport, scrollY: 0.5 })
    expect(project(scene.get(), localRow, false)[0]?.grid).toBe(card.grid)
  }
})

it("culls every non-intersecting row and clip through randomized viewport transforms", () => {
  let seed = 0x3285a
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  const clips: Clip[] = Array.from({ length: 50 }, (_, index) => ({
    kind: "pattern",
    id: `p-${index}`,
    patternId: "p",
    startBar: 1 + index * 4,
    lengthBars: 2,
    steps: [true, false, true, false],
  }))
  score.tracks = Array.from({ length: 200 }, (_, index) => ({
    ...track,
    id: `t-${index}`,
    clips,
    childTrackIds: undefined,
  }))
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setMusic({
    bars: 256,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: score.tracks,
    markers: [],
    loop: score.transport.loop,
  })
  for (let sample = 0; sample < 500; sample++) {
    const viewport = {
      width: 100 + random() * 1500,
      height: 100 + random() * 900,
      pxPerBar: 4 + random() * 1000,
      scrollX: random() * 10000,
      scrollY: random() * 20000,
      dpr: 1,
    }
    scene.setViewport(viewport)
    const rows = visibleRows(scene.get())
    const expectedRows = layoutTrackRows(scene.get()).filter(
      row => row.top + row.height > 34 && row.top < viewport.height - 18
    )
    expect(rows.map(row => row.track.id)).toEqual(expectedRows.map(row => row.track.id))
    for (const row of rows) {
      const cards = visibleClipCards(scene.get(), row, false)
      const interior = row.track.clips.filter(
        clip =>
          (clip.startBar - 1 + clip.lengthBars) * viewport.pxPerBar > viewport.scrollX + 1 &&
          (clip.startBar - 1) * viewport.pxPerBar < viewport.scrollX + viewport.width - 1
      )
      for (const clip of interior) expect(cards.some(card => card.clip.id === clip.id)).toBe(true)
      for (const card of cards) {
        expect(card.geometry.left).toBeLessThan(viewport.width + 1)
        expect(card.geometry.left + card.geometry.width).toBeGreaterThan(0)
      }
    }
  }
})

it("clips retained MIDI repetitions and Pattern activity to the visible source window", () => {
  let seed = 0x9285a
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  for (let sample = 0; sample < 800; sample++) {
    const width = 20 + random() * 1000
    const viewportWidth = 10 + random() * 500
    const left = -random() * width
    const sourceOffsetBars = random() * 16
    const lengthBars = 1 + random() * 16
    const midi: Clip = {
      kind: "midi",
      id: "m",
      startBar: 1,
      lengthBars,
      sourceOffsetBars,
      loopBars: 2,
      notes: [
        { pitch: 60, startBeat: 0, lengthBeats: 2, velocity: 100 },
        { pitch: 72, startBeat: 3, lengthBeats: 1, velocity: 100 },
      ],
    }
    const row = { trackGeometry: DEFAULT_LAYOUT_TOKENS.track, track, top: 50, height: 100 }
    const geometry = clipVisualGeometry(
      { ...clipRect(midi, row, width / lengthBars, -left), left, width },
      midi,
      track,
      false
    )
    const pattern: Clip = {
      kind: "pattern",
      id: "p",
      patternId: "p",
      startBar: 1,
      lengthBars,
      sourceOffsetBars,
      steps: [true, false, false, true, false, false, false, false],
    }
    for (const rect of [
      ...midiPreviewRects(midi, geometry, 4, viewportWidth, PROJECT_METRICS),
      ...patternPreviewRects(pattern, geometry, viewportWidth, PROJECT_METRICS),
    ]) {
      expect(rect.left).toBeGreaterThanOrEqual(0)
      expect(rect.left + rect.width).toBeLessThanOrEqual(viewportWidth + 1)
      expect(rect.left + rect.width).toBeLessThanOrEqual(geometry.left + geometry.width + 1)
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.top).toBeGreaterThanOrEqual(geometry.bodyTop)
      expect(rect.top + rect.height).toBeLessThanOrEqual(geometry.bodyTop + geometry.bodyHeight)
    }
    for (const tick of clipLoopTicks(midi, geometry, viewportWidth, PROJECT_METRICS)) {
      expect(tick).toBeGreaterThanOrEqual(0)
      expect(tick).toBeLessThanOrEqual(viewportWidth)
      const bar = sourceOffsetBars + ((tick - geometry.left) / geometry.width) * lengthBars
      expect(Math.abs(bar / 2 - Math.round(bar / 2))).toBeLessThanOrEqual(
        lengthBars / geometry.width
      )
    }
  }
})

it("renders only the active Ghost while the source remains at its committed position", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  const clip = track?.clips[0]
  if (!track || !clip) throw new Error("Missing MIDI clip")
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: [track],
    markers: [],
    loop: score.transport.loop,
  })
  scene.setViewport({ width: 900, height: 300, scrollX: 0, scrollY: 0, pxPerBar: 64, dpr: 1 })
  scene.setSelection(new Set([clip.id]))
  scene.setClipDrag({ source: [track], ids: new Set([clip.id]) })
  scene.setProjectPreview({
    kind: "tracks",
    token: { sessionId: "fixture", id: "preview" },
    tracks: [{ ...track, clips: [{ ...clip, startBar: 3 }] }],
  })
  const row = visibleRows(scene.get())[0]
  if (!row) throw new Error("Missing row")
  const cards = visibleClipCards(scene.get(), row, false)
  expect(cards.map(card => [card.geometry.left, card.ghost, card.selected])).toEqual([
    [0, false, false],
    [128, true, true],
  ])
})

it("retains MIDI source phase after trimming and across equivalent loop windows", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  const row = { trackGeometry: DEFAULT_LAYOUT_TOKENS.track, track, top: 50, height: 100 }
  const base: MidiClip = {
    kind: "midi",
    id: "m",
    startBar: 1,
    lengthBars: 2,
    loopBars: 2,
    notes: [{ pitch: 60, startBeat: 1, lengthBeats: 0.5, velocity: 100 }],
  }
  const phases: [number, number][] = [
    [0.25, 0],
    [0.5, 448],
  ]
  for (const [sourceOffsetBars, expectedLeft] of phases) {
    const clip = { ...base, sourceOffsetBars }
    const geometry = clipVisualGeometry(clipRect(clip, row, 256, 0), clip, track, false)
    expect(
      midiPreviewRects(clip, geometry, 4, 512, PROJECT_METRICS).map(note => [note.left, note.width])
    ).toEqual([[expectedLeft, 32]])
  }
  let seed = 0x781903
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
  for (let sample = 0; sample < 500; sample++) {
    const loopBars = 0.5 + Math.floor(random() * 16) / 2
    const clip: MidiClip = {
      ...base,
      loopBars,
      lengthBars: 0.25 + Math.floor(random() * 32) / 4,
      sourceOffsetBars: Math.floor(random() * 64) / 4,
      notes: [
        {
          pitch: 60,
          startBeat: Math.floor(random() * 128) / 4,
          lengthBeats: (1 + Math.floor(random() * 8)) / 4,
          velocity: 100,
        },
      ],
    }
    const width = Math.round(200 + random() * 600)
    const scrollX = Math.floor(random() * 150)
    const geometry = clipVisualGeometry(
      clipRect(clip, row, width / clip.lengthBars, scrollX),
      clip,
      track,
      false
    )
    const original = midiPreviewRects(clip, geometry, 4, 600, PROJECT_METRICS)
    const cycled = midiPreviewRects(
      { ...clip, sourceOffsetBars: (clip.sourceOffsetBars ?? 0) + loopBars },
      geometry,
      4,
      600,
      PROJECT_METRICS
    )
    expect(cycled.length).toBe(original.length)
    for (let index = 0; index < original.length; index++) {
      expect(cycled[index]?.left).toBeCloseTo(original[index]?.left ?? NaN, 7)
      expect(cycled[index]?.width).toBeCloseTo(original[index]?.width ?? NaN, 7)
    }
  }
})
