// @vitest-environment jsdom
import { expect, it } from "vitest"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import { createSceneStore } from "../scene"
import { paintClips } from "./clip"
import { paintRecording } from "./recording"
import { readTokens } from "../tokens"

function fixture() {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(track => track.kind === "audio")!
  const clip = track.clips[0]
  if (clip.kind !== "audio") throw new Error("Missing audio fixture")
  const store = createSceneStore()
  store.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: document.transport,
    tracks: [
      {
        ...track,
        color: "rgb(100, 180, 120)",
        collapsed: false,
        heightPx: 126,
        clips: [{ ...clip, startBar: 1, lengthBars: 1, fadeInBars: 0, fadeOutBars: 0 }],
      },
    ],
    media: document.media,
    patterns: document.patterns,
    loop: document.transport.loop,
    markers: [],
  })
  store.setViewport({ pxPerBar: 160, scrollX: 0, scrollY: 0, width: 900, height: 320, dpr: 1 })
  const rectangles: {
    x: number
    width: number
    height: number
    color: string | CanvasGradient | CanvasPattern
    alpha: number
  }[] = []
  const waves: number[] = []
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
    fillText() {},
    strokeRect() {},
    fill() {
      waves.push(context.globalAlpha)
    },
    fillRect(x: number, _y: number, width: number, height: number) {
      rectangles.push({ x, width, height, color: context.fillStyle, alpha: context.globalAlpha })
    },
  } as unknown as CanvasRenderingContext2D
  const tokens = readTokens(window.document.documentElement)
  tokens["--arrangement-surface"] = "rgb(31, 31, 31)"
  return { store, clip, tokens, context, rectangles, waves }
}

it("keeps Ghost title color and waveform while leaving its body transparent", () => {
  const { store, clip, tokens, context, rectangles, waves } = fixture()
  const source = store.get().tracks
  const ghost = { ...source[0].clips[0], id: "ghost", startBar: 3 }
  store.setClipDrag({ source, ids: new Set([ghost.id]) })
  store.setProjectPreview({
    kind: "tracks",
    token: { sessionId: "test", id: "drag" },
    tracks: [{ ...source[0], clips: [ghost] }],
  })
  paintClips(context, store.get(), tokens, {
    selectedClipIds: new Set([clip.id]),
    hoverClip: null,
    automationMode: false,
  })
  expect(
    rectangles.some(
      rect =>
        rect.x === 320 &&
        rect.width > 1 &&
        rect.height === 21 &&
        rect.color === source[0].color &&
        rect.alpha === 0.5
    )
  ).toBe(true)
  expect(rectangles.filter(rect => rect.x === 320 && rect.width > 1 && rect.height > 30)).toEqual(
    []
  )
  expect(waves).toContain(0.5)
})

it("shows retained clips as inactive while In monitors input without muting authored clips", () => {
  const { store, clip, tokens, context, rectangles, waves } = fixture()
  const original = store.get().tracks[0]
  store.setMusic({ ...store.get(), tracks: [{ ...original, input: "external", monitor: "in" }] })
  paintClips(context, store.get(), tokens, {
    selectedClipIds: new Set([clip.id]),
    hoverClip: null,
    automationMode: false,
  })
  expect(
    rectangles.some(
      rect => rect.color === tokens["--arrangement-muted-clip-title"] && rect.width > 1
    )
  ).toBe(true)
  expect(rectangles.filter(rect => rect.width > 1 && rect.height > 30)).toEqual([])
  expect(waves).toContain(0.25)
  expect(store.get().tracks[0].clips[0].mute).toBe(clip.mute)
})

it.each([31.5, 160.37, 8000.25])(
  "keeps a one-pixel separator at fractional zoom %s without shrinking content",
  zoom => {
    const { store, tokens, context, rectangles } = fixture()
    const track = store.get().tracks[0]
    const first = track.clips[0]
    store.setMusic({
      ...store.get(),
      tracks: [{ ...track, clips: [first, { ...first, id: "second", startBar: 2 }] }],
    })
    store.setViewport({ ...store.get().viewport, pxPerBar: zoom, scrollX: zoom - 250 })
    paintClips(context, store.get(), tokens, {
      selectedClipIds: new Set(),
      hoverClip: null,
      automationMode: false,
    })
    expect(
      rectangles.filter(
        rect =>
          rect.x === 249 &&
          rect.width === 1 &&
          rect.height > 30 &&
          rect.color === tokens["--arrangement-surface"] &&
          rect.alpha === 1
      )
    ).toHaveLength(1)
  }
)

it("paints the growing recording with the normal card and overlays the whole recording track", () => {
  const { store, tokens, context, rectangles, waves } = fixture()
  const track = store.get().tracks[0]
  tokens["--destructive"] = "recording-red"
  const take = {
    trackId: track.id,
    clipId: "take",
    startBar: 1,
    durationBars: 1,
    channels: [{ min: [-0.5, -0.25], max: [0.5, 0.25] }],
  }
  const preview = { sessionId: "session", recordingId: "recording", tracks: [take] }
  paintRecording(context, store.get(), tokens, preview, true)
  expect(
    rectangles.some(
      rect => rect.x === 0 && rect.width === 160 && rect.color === track.color && rect.height === 21
    )
  ).toBe(true)
  expect(
    rectangles.some(
      rect =>
        rect.x === 0 && rect.width === 900 && rect.color === "recording-red" && rect.alpha === 0.18
    )
  ).toBe(true)
  expect(waves.length).toBeGreaterThan(0)
  rectangles.length = 0
  paintRecording(
    context,
    store.get(),
    tokens,
    { ...preview, tracks: [{ ...take, durationBars: 2 }] },
    false
  )
  expect(
    rectangles.some(
      rect => rect.x === 0 && rect.width === 320 && rect.color === track.color && rect.height === 21
    )
  ).toBe(true)
  expect(rectangles.some(rect => rect.color === "recording-red")).toBe(false)
})

it("tints each simultaneous recording track without tinting an unarmed row", () => {
  const { store, tokens, context, rectangles } = fixture()
  const first = store.get().tracks[0]
  const second = { ...first, id: "second", clips: [] }
  const third = { ...first, id: "third", clips: [] }
  store.setMusic({ ...store.get(), tracks: [first, second, third] })
  store.setViewport({ ...store.get().viewport, height: 600 })
  tokens["--destructive"] = "recording-red"
  const take = { clipId: "one", startBar: 1, durationBars: 1, channels: [] }
  paintRecording(
    context,
    store.get(),
    tokens,
    {
      sessionId: "session",
      recordingId: "take",
      tracks: [
        { ...take, trackId: first.id },
        { ...take, clipId: "two", trackId: second.id },
      ],
    },
    true
  )
  expect(
    rectangles.filter(rect => rect.color === "recording-red" && rect.width === 900)
  ).toHaveLength(2)
})
