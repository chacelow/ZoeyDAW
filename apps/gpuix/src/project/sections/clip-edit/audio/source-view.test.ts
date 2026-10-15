import { expect, test } from "bun:test"
import {
  MIN_SOURCE_SPAN,
  overviewExtent,
  panSource,
  sourceBounds,
  sourceRange,
  zoomSource,
} from "./source-view"
import type { SourceView } from "./source-view"
import { defaultAudioClipSettings } from "@/project/model/audio-editor"
import type { AudioClip } from "@/project/model/types"

function samples(seed: number) {
  let state = seed
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

test("source range contains the retained sample, playback markers, and independent loop", () => {
  const clip: AudioClip = {
    id: "range",
    kind: "audio",
    samplePath: "sample.wav",
    startBar: 19,
    sourceOffsetBars: -2,
    lengthBars: 4,
    gainDb: 0,
  }
  const settings = {
    ...defaultAudioClipSettings(120, clip),
    startMarkerBars: 1,
    endMarkerBars: 8,
    loopStartBars: 3,
    loopLengthBars: 7,
  }
  expect(sourceRange(clip, settings)).toEqual({ start: -2, span: 12 })
  expect(sourceBounds(sourceRange(clip, settings))).toEqual({ minimum: -2, maxSpan: 48 })
})

test("fixed-seed zoom holds the chosen source point, clamps both zoom limits and never pans before the bound", () => {
  const random = samples(0xa0d10)
  for (let index = 0; index < 256; index++) {
    const range: SourceView = { start: random() * 8 - 3, span: 0.05 + random() * 24 }
    const bounds = sourceBounds(range)
    const view: SourceView = {
      start: bounds.minimum + random() * 20,
      span: MIN_SOURCE_SPAN + random() * (bounds.maxSpan - MIN_SOURCE_SPAN),
    }
    const anchor = random()
    const factor = 0.25 + random() * 4
    const zoomed = zoomSource(view, range, factor, anchor)
    const expectedSpan = Math.max(MIN_SOURCE_SPAN, Math.min(bounds.maxSpan, view.span / factor))
    expect(zoomed.span).toBeCloseTo(expectedSpan, 10)
    expect(zoomed.start).toBeGreaterThanOrEqual(bounds.minimum)
    const oldPoint = view.start + view.span * anchor
    const newPoint = zoomed.start + zoomed.span * anchor
    if (view.start + (view.span - zoomed.span) * anchor >= bounds.minimum)
      expect(newPoint).toBeCloseTo(oldPoint, 9)
    else expect(zoomed.start).toBe(bounds.minimum)
    expect(panSource(zoomed, range, -1_000).start).toBe(bounds.minimum)
    expect(panSource(zoomed, range, 2).span).toBe(zoomed.span)
  }
  const range = { start: 0, span: 2 }
  expect(zoomSource({ start: 0, span: 2 }, range, 1e12, 0).span).toBe(MIN_SOURCE_SPAN)
  expect(zoomSource({ start: 0, span: 2 }, range, 1e-12, 1).span).toBe(8)
  expect(zoomSource({ start: 0, span: 2 }, range, 2, -5)).toEqual({ start: 0, span: 1 })
  expect(zoomSource({ start: 0, span: 2 }, range, 2, 5)).toEqual({ start: 1, span: 1 })
})

test("overview includes the range and scrolled view; pan preserves span without an artificial right edge", () => {
  const random = samples(0x5ee0)
  for (let index = 0; index < 256; index++) {
    const range = { start: random() * 8 - 3, span: 0.1 + random() * 20 }
    const bounds = sourceBounds(range)
    const original = { start: bounds.minimum + random() * 8, span: 0.1 + random() * 12 }
    const view = panSource(original, range, random() * 20)
    const extent = overviewExtent(range, view)
    expect(extent.start).toBe(bounds.minimum)
    expect(extent.start + extent.span).toBeGreaterThanOrEqual(range.start + range.span)
    expect(extent.start + extent.span).toBeGreaterThanOrEqual(view.start + view.span)
    expect(view.span).toBe(original.span)
    expect(view.start).toBeGreaterThanOrEqual(original.start)
    expect(overviewExtent(range, panSource(view, range, 100)).span).toBeGreaterThan(extent.span)
  }
})
