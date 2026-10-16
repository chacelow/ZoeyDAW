import { expect, test } from "bun:test"
import { metronomePhase, tappedTempo } from "./metronome"

test("property: adjacent accepted beats alternate across meters and bar boundaries", () => {
  for (let numerator = 1; numerator <= 32; numerator++) {
    for (let ordinal = 0; ordinal < 256; ordinal++) {
      const position = {
        bar: Math.floor(ordinal / numerator) + 1,
        beat: (ordinal % numerator) + 1,
        sixteenth: 1,
      }
      const next = {
        bar: Math.floor((ordinal + 1) / numerator) + 1,
        beat: ((ordinal + 1) % numerator) + 1,
        sixteenth: 1,
      }
      const phase = metronomePhase(position, numerator, true, true)
      expect(phase.side * metronomePhase(next, numerator, true, true).side).toBe(-1)
      expect(phase.swing).toBe(phase.side)
      expect(metronomePhase(position, numerator, false, true)).toEqual({ side: 0, swing: 0 })
      expect(metronomePhase(position, numerator, true, false)).toEqual({ side: 0, swing: 0 })
    }
  }
})

test("property: swing follows accepted fractional beat, independent of wall time and tempo", () => {
  for (let sixteenth = 1; sixteenth <= 5; sixteenth += 0.125) {
    const phase = metronomePhase({ bar: 3, beat: 2, sixteenth }, 4, true, true)
    expect(Math.abs(phase.swing)).toBeLessThanOrEqual(1)
    expect(phase.swing).toBeCloseTo(1 - (sixteenth - 1) / 2)
  }
})

test("tap tempo averages recent intervals, expires stale taps and limits history", () => {
  expect(tappedTempo([], 1000)).toEqual({ taps: [1000], bpm: null })
  expect(tappedTempo([1000, 1500], 2000).bpm).toBe(120)
  expect(tappedTempo([0, 1000, 2000], 3000)).toEqual({ taps: [1000, 2000, 3000], bpm: 60 })
  expect(tappedTempo([0, 500, 1000, 1500, 2000], 2500)).toEqual({
    taps: [500, 1000, 1500, 2000, 2500],
    bpm: 120,
  })
  expect(tappedTempo([1000], 1000).bpm).toBeNull()
})

test("tap tempo follows explicit window and sample preferences", () => {
  const policy = { stopRepeatMs: 450, tapWindowMs: 900, tapSamples: 3 }
  expect(tappedTempo([0, 500, 1000], 1400, policy)).toEqual({ taps: [1000, 1400], bpm: 150 })
  expect(tappedTempo([1000, 1200, 1400], 1600, policy)).toEqual({
    taps: [1200, 1400, 1600],
    bpm: 300,
  })
})
