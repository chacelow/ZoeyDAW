import { describe, expect, it } from "vitest"
import { paintClipLoopTicks, paintMidiNotes, paintPatternNotes } from "./clip-previews"
import type { MidiClip, PatternClip } from "@/pages/project/model/types"

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

  it("marks every visible source-cycle boundary across MIDI, Pattern and Audio", () => {
    const pattern: PatternClip = {
      id: "pattern-loop",
      kind: "pattern",
      patternId: "pattern",
      startBar: 1,
      lengthBars: 3,
      sourceOffsetBars: -1,
      steps: [true, false, false, false, true, false, false, false],
    }
    const audio = {
      id: "audio-loop",
      kind: "audio" as const,
      samplePath: "mock://untitled.wav",
      gainDb: 0,
      startBar: 1,
      lengthBars: 3,
      sourceOffsetBars: -1,
    }
    const ticks = (clip: MidiClip | PatternClip | typeof audio) =>
      paintRectangles(ctx => paintClipLoopTicks(ctx, clip, 0, 0, 120, 120, "ink")).map(
        rect => rect[0]
      )
    expect(ticks({ ...midi, sourceOffsetBars: -2, lengthBars: 6 })).toEqual([40, 80])
    expect(ticks(pattern)).toEqual([20, 40, 60, 80, 100])
    expect(ticks(audio)).toEqual([40, 80])
  })

  it("repeats Pattern steps when extension begins before retained source zero", () => {
    const pattern: PatternClip = {
      id: "pattern-loop",
      kind: "pattern",
      patternId: "pattern",
      startBar: 1,
      lengthBars: 1,
      sourceOffsetBars: -0.25,
      steps: [true, false, false, false],
    }
    const strokes = paintRectangles(context =>
      paintPatternNotes(context, pattern, 0, 14, 160, 20, "ink", 160)
    )
    expect(strokes.map(rect => rect[0])).toEqual([0, 40, 80, 120])
  })
})
