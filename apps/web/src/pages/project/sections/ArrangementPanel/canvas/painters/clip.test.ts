import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { expect, it } from "vitest"
import type { Clip } from "@zoeydaw/project-core/types"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  layoutTrackRows,
  pinnedTrackHeight,
} from "../layout"
import { createSceneStore } from "../scene"
import { readTokens } from "../tokens"
import { paintClips } from "./clip"

it("paints one divider at each visible row join without leaking scrolled rows into pinned tracks", () => {
  const fixture = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const tracks = fixture.tracks.map(track => ({ ...track, clips: [] }))
  const store = createSceneStore()
  store.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: fixture.transport,
    markers: [],
    loop: fixture.transport.loop,
    tracks,
    media: fixture.media,
    patterns: fixture.patterns,
  })
  store.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 100, width: 180, height: 320, dpr: 1 })
  const scene = store.get()
  const pinnedTop = arrangementBodyBottom(scene.viewport.height) - pinnedTrackHeight(tracks)
  const rows = layoutTrackRows(scene)
  const normalRows = rows.filter(row => row.track.kind !== "return" && row.track.kind !== "main")
  expect(normalRows.some(row => row.top < pinnedTop && row.top + row.height > pinnedTop)).toBe(true)

  const dividers: number[] = []
  let start: [number, number] | null = null
  const context = {
    save() {},
    restore() {},
    setTransform() {},
    beginPath() {},
    rect() {},
    clip() {},
    moveTo(x: number, y: number) {
      start = [x, y]
    },
    lineTo(x: number, y: number) {
      if (start?.[0] === 0 && start[1] === y && x === scene.viewport.width) {
        dividers.push(y)
      }
    },
    stroke() {},
    closePath() {},
    fill() {},
  } as unknown as CanvasRenderingContext2D
  paintClips(context, scene, readTokens(document.documentElement), {
    selectedClipIds: scene.selectedClipIds,
    hoverClip: null,
    automationMode: false,
  })

  const visibleJoins = rows
    .filter(row => row.top + row.height > arrangementBodyTop())
    .filter(
      row =>
        row.top + row.height <
        (row.track.kind === "return" || row.track.kind === "main"
          ? arrangementBodyBottom(scene.viewport.height)
          : pinnedTop)
    )
    .map(row => row.top + row.height - 1)
  expect(dividers).toEqual([...visibleJoins, pinnedTop - 1])
  expect(new Set(dividers).size).toBe(dividers.length)
  expect(
    dividers.every(
      y => y >= arrangementBodyTop() && y < arrangementBodyBottom(scene.viewport.height)
    )
  ).toBe(true)
})

it.each(["audio", "midi", "pattern"] as const)(
  "keeps the grid visible under an inactive %s clip even when selected",
  kind => {
    const fixture = createMockDocument(DEFAULT_TRACK_HEIGHT)
    const owner = fixture.tracks.find(track => track.kind === "audio")!
    const base = { id: "inactive", startBar: 1, lengthBars: 4, mute: true }
    const clip: Clip =
      kind === "audio"
        ? { ...base, kind, sourceId: "mock://kick.wav", gainDb: 0, waveformPeaks: [0.5] }
        : kind === "midi"
          ? { ...base, kind, notes: [{ pitch: 60, startBeat: 0, lengthBeats: 1, velocity: 100 }] }
          : { ...base, kind, patternId: "pattern" }
    const store = createSceneStore()
    store.setMusic({
      bars: 128,
      grid: { mode: "fixed", bars: 1 },
      transport: fixture.transport,
      markers: [],
      loop: fixture.transport.loop,
      tracks: [{ ...owner, clips: [clip] }],
      media: fixture.media,
      patterns: [
        {
          id: "pattern",
          loopBars: 1,
          notes: [{ pitch: 60, startBeat: 0, lengthBeats: 0.25, velocity: 100 }],
        },
      ],
    })
    store.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 180, height: 320, dpr: 1 })
    const fills: { width: number; height: number; color: string; alpha: number }[] = []
    const context = {
      fillStyle: "",
      strokeStyle: "",
      globalAlpha: 1,
      save() {},
      restore() {},
      setTransform() {},
      beginPath() {},
      rect() {},
      clip() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      closePath() {},
      fill() {},
      fillText() {},
      strokeRect() {},
      fillRect(_x: number, _y: number, width: number, height: number) {
        fills.push({ width, height, color: this.fillStyle, alpha: this.globalAlpha })
      },
    }
    const tokens = readTokens(document.documentElement)
    tokens["--arrangement-muted-clip-title"] = "inactive-title"
    tokens["--arrangement-clip-selected"] = "selected"
    // The recording context observes the production renderer without rasterizing.
    const painter = context as unknown as CanvasRenderingContext2D
    paintClips(painter, store.get(), tokens, {
      selectedClipIds: new Set([clip.id]),
      hoverClip: null,
      automationMode: false,
    })
    expect(fills.some(fill => fill.color === "inactive-title" && fill.alpha === 1)).toBe(true)
    expect(fills.filter(fill => fill.width > 1 && fill.height > 30 && fill.alpha > 0)).toEqual([])
    expect(fills.some(fill => fill.color === "selected")).toBe(false)
  }
)

it("repaints every Pattern placement from shared notes without changing its trim", () => {
  const fixture = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const owner = fixture.tracks.find(track => track.kind === "audio")!
  const clips: Clip[] = [
    { id: "first", kind: "pattern", patternId: "shared", startBar: 1, lengthBars: 1 },
    {
      id: "second",
      kind: "pattern",
      patternId: "shared",
      startBar: 3,
      lengthBars: 1,
      sourceOffsetBars: 0.5,
    },
  ]
  const store = createSceneStore()
  store.setMusic({
    bars: 8,
    grid: { mode: "fixed", bars: 1 },
    transport: fixture.transport,
    markers: [],
    loop: fixture.transport.loop,
    tracks: [{ ...owner, collapsed: false, heightPx: 120, clips }],
    media: fixture.media,
    patterns: [
      {
        id: "shared",
        loopBars: 1,
        notes: [{ pitch: 60, startBeat: 0, lengthBeats: 1, velocity: 100 }],
      },
    ],
  })
  store.setViewport({ pxPerBar: 160, scrollX: 0, scrollY: 0, width: 640, height: 320, dpr: 1 })
  const strokes: number[][] = []
  const context = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    save() {},
    restore() {},
    setTransform() {},
    beginPath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    closePath() {},
    fill() {},
    fillText() {},
    strokeRect() {},
    fillRect(x: number, _y: number, width: number, height: number) {
      if (context.fillStyle === "shared-note-ink" && height === 3) strokes.push([x, width])
    },
  } as unknown as CanvasRenderingContext2D
  const tokens = readTokens(document.documentElement)
  tokens["--arrangement-clip-ink"] = "shared-note-ink"
  const options = { selectedClipIds: new Set<string>(), hoverClip: null, automationMode: false }
  paintClips(context, store.get(), tokens, options)
  expect(strokes).toEqual([
    [0, 40],
    [400, 40],
  ])
  strokes.length = 0
  store.setMusic({
    ...store.get(),
    patterns: [
      {
        id: "shared",
        loopBars: 1,
        notes: [{ pitch: 67, startBeat: 2, lengthBeats: 0.5, velocity: 100 }],
      },
    ],
  })
  paintClips(context, store.get(), tokens, options)
  expect(strokes).toEqual([
    [80, 20],
    [320, 20],
  ])
  expect(store.get().tracks[0].clips).toBe(clips)
})
