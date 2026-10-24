import { describe, expect, it } from "vitest"
import { paintClipLoopTicks, paintMidiNotes } from "./clip-previews"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import type { MidiClip, MidiPattern, PatternClip } from "@zoeydaw/project-core/types"
import { fixtureMediaSource } from "@zoeydaw/project-core/media"

function paintRectangles(paint: (context: CanvasRenderingContext2D) => void): number[][] {
  const rectangles: number[][] = []
  const context = {
    globalAlpha: 1,
    fillStyle: "",
    fillRect: (...values: number[]) => {
      rectangles.push(values)
    },
  } as unknown as CanvasRenderingContext2D
  paint(context)
  return rectangles
}

const midi: MidiClip = {
  id: "midi-loop",
  kind: "midi",
  startBar: 1,
  lengthBars: 6,
  loopBars: 2,
  notes: [{ pitch: 60, startBeat: 1, lengthBeats: 1, velocity: 100 }],
}

const pattern: PatternClip = {
  id: "pattern-loop",
  kind: "pattern",
  patternId: "shared",
  startBar: 1,
  lengthBars: 1,
  sourceOffsetBars: -0.25,
}

function patternRectangles(clip: PatternClip, patterns: readonly MidiPattern[]) {
  return paintRectangles(context =>
    paintMidiNotes(context, resolveMidiClip(clip, patterns), 0, 14, 160, 20, "ink", 4, 160)
  )
}

describe("clip loop preview", () => {
  it("repeats MIDI notes over authored cycles and wraps signed left extension", () => {
    const forward = paintRectangles(context =>
      paintMidiNotes(context, midi, 0, 14, 120, 20, "ink", 4, 120)
    )
    expect(forward.map(rect => [rect[0], rect[2]])).toEqual([
      [5, 5],
      [45, 5],
      [85, 5],
    ])

    const extended = {
      ...midi,
      sourceOffsetBars: -1,
      lengthBars: 3,
      notes: [{ pitch: 60, startBeat: 5, lengthBeats: 1, velocity: 100 }],
    }
    const backwards = paintRectangles(context =>
      paintMidiNotes(context, extended, 0, 14, 120, 20, "ink", 4, 120)
    )
    expect(backwards.map(rect => [rect[0], rect[2]])).toEqual([
      [10, 10],
      [90, 10],
    ])
  })

  it("marks source-cycle boundaries using shared Pattern loop length", () => {
    const patterns: MidiPattern[] = [{ id: "shared", loopBars: 0.5, notes: [] }]
    const audio = {
      id: "audio-loop",
      kind: "audio" as const,
      sourceId: "stable-audio-source",
      gainDb: 0,
      startBar: 1,
      lengthBars: 3,
      sourceOffsetBars: -1,
    }
    const media = [{ ...fixtureMediaSource("mock://untitled.wav"), id: audio.sourceId }]
    const ticks = (clip: MidiClip | PatternClip | typeof audio, content = patterns) =>
      paintRectangles(ctx =>
        paintClipLoopTicks(ctx, clip, 0, 0, 120, 120, "ink", media, content)
      ).map(rect => rect[0])
    expect(ticks({ ...midi, sourceOffsetBars: -2, lengthBars: 6 })).toEqual([40, 80])
    const extended = { ...pattern, lengthBars: 3, sourceOffsetBars: -1 }
    expect(ticks(extended)).toEqual([20, 40, 60, 80, 100])
    expect(ticks(extended, [{ id: "shared", loopBars: 1, notes: [] }])).toEqual([40, 80])
    expect(ticks(audio)).toEqual([40, 80])
  })

  it("renders shared Pattern pitches, duration and repeats with the MIDI painter", () => {
    const shared: MidiPattern = {
      id: "shared",
      loopBars: 0.25,
      notes: [
        { pitch: 60, startBeat: 0, lengthBeats: 0.25, velocity: 100 },
        { pitch: 72, startBeat: 0.5, lengthBeats: 0.5, velocity: 70 },
      ],
    }
    const strokes = patternRectangles(pattern, [shared])
    expect(strokes.filter(rect => rect[1] === 31).map(rect => [rect[0], rect[2]])).toEqual([
      [0, 10],
      [40, 10],
      [80, 10],
      [120, 10],
    ])
    expect(strokes.filter(rect => rect[1] === 15).map(rect => [rect[0], rect[2]])).toEqual([
      [20, 20],
      [60, 20],
      [100, 20],
      [140, 20],
    ])
    const equivalent = paintRectangles(context =>
      paintMidiNotes(
        context,
        { ...pattern, kind: "midi", ...shared },
        0,
        14,
        160,
        20,
        "ink",
        4,
        160
      )
    )
    expect(strokes).toEqual(equivalent)
  })

  it("reflects shared-note edits in each independently trimmed placement", () => {
    const original: MidiPattern[] = [
      {
        id: "shared",
        loopBars: 1,
        notes: [{ pitch: 60, startBeat: 0, lengthBeats: 0.5, velocity: 100 }],
      },
    ]
    const edited: MidiPattern[] = [
      {
        id: "shared",
        loopBars: 1,
        notes: [{ pitch: 67, startBeat: 2, lengthBeats: 1, velocity: 100 }],
      },
    ]
    const placements = [pattern, { ...pattern, id: "copy", startBar: 5, sourceOffsetBars: 0.5 }]
    const before = placements.map(clip => patternRectangles(clip, original))
    const after = placements.map(clip => patternRectangles(clip, edited))
    expect(after[0]).not.toEqual(before[0])
    expect(after[1]).not.toEqual(before[1])
    expect(after[0]).not.toEqual(after[1])
    expect(placements.map(clip => patternRectangles(clip, original))).toEqual(before)
  })

  it.each([0.5, 2, 3])("keeps notes inside a compact %s-pixel overview band", height => {
    const strokes = paintRectangles(context =>
      paintMidiNotes(context, midi, 0, 14, 120, height, "ink", 4, 120)
    )
    expect(strokes.length).toBeGreaterThan(0)
    expect(strokes.every(([, y, , extent]) => y >= 14 && y + extent <= 14 + height)).toBe(true)
  })

  it("rejects a missing shared Pattern instead of drawing substitute content", () => {
    expect(() => patternRectangles(pattern, [])).toThrow()
    expect(() =>
      paintRectangles(context =>
        paintClipLoopTicks(context, pattern, 0, 0, 160, 160, "ink", [], [])
      )
    ).toThrow()
  })
})
