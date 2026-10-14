import { describe, expect, it } from "vitest"
import { formatAudioMusicalValue, parseAudioMusicalValue } from "./musical-value"
import type { AudioMusicalValueKind } from "./musical-value"

const cases: {
  numerator: number
  denominator?: number
  kind: AudioMusicalValueKind
  bars: number
  text: string
}[] = [
  { numerator: 4, kind: "position", bars: 0, text: "1.1.1" },
  { numerator: 4, kind: "position", bars: 1, text: "2.1.1" },
  { numerator: 4, kind: "position", bars: 1 / 4, text: "1.2.1" },
  { numerator: 4, kind: "duration", bars: 0, text: "0.0.0" },
  { numerator: 4, kind: "duration", bars: 1, text: "1.0.0" },
  { numerator: 3, kind: "position", bars: 0, text: "1.1.1" },
  { numerator: 3, kind: "position", bars: 1 / 3, text: "1.2.1" },
  { numerator: 3, kind: "position", bars: 1 / 12, text: "1.1.2" },
  { numerator: 3, kind: "position", bars: 2 + 2 / 3, text: "3.3.1" },
  { numerator: 3, kind: "duration", bars: 1, text: "1.0.0" },
  { numerator: 3, kind: "duration", bars: 11 / 12, text: "0.2.3" },
  { numerator: 3, kind: "duration", bars: 1 / 4, text: "0.0.3" },
  { numerator: 4, denominator: 8, kind: "position", bars: 0, text: "1.1.1" },
  { numerator: 4, denominator: 8, kind: "position", bars: 1 / 8, text: "1.1.2" },
  { numerator: 4, denominator: 8, kind: "position", bars: 1 / 4, text: "1.2.1" },
  { numerator: 4, denominator: 8, kind: "duration", bars: 7 / 8, text: "0.3.1" },
  { numerator: 3, denominator: 8, kind: "position", bars: 1 / 6, text: "1.1.2" },
  { numerator: 3, denominator: 8, kind: "position", bars: 1 / 3, text: "1.2.1" },
  { numerator: 3, denominator: 8, kind: "duration", bars: 5 / 6, text: "0.2.1" },
]

describe("Audio musical positions and durations", () => {
  for (const { numerator, denominator = 4, kind, bars, text } of cases) {
    it(`roundtrips ${kind} ${text} in ${numerator}/${denominator} without shifting source coordinates`, () => {
      expect(formatAudioMusicalValue(bars, numerator, denominator, kind)).toBe(text)
      expect(parseAudioMusicalValue(text, numerator, denominator, kind, 0, 100)).toBeCloseTo(
        bars,
        10
      )
    })
  }
  it("accepts raw decimal bars independently of one-based position formatting", () => {
    expect(parseAudioMusicalValue("0", 4, 4, "position", 0, 100)).toBe(0)
    expect(parseAudioMusicalValue("1.5", 3, 8, "position", 0, 100)).toBe(1.5)
    expect(parseAudioMusicalValue(" .1 ", 3, 4, "duration", 0, 100)).toBe(0.1)
    expect(parseAudioMusicalValue("2e1", 4, 8, "duration", 0, 100)).toBe(20)
  })
  it("retains sub-sixteenth values instead of silently trimming authored source precision", () => {
    for (const numerator of [3, 4]) {
      for (const denominator of [4, 8, 32]) {
        for (const kind of ["position", "duration"] satisfies AudioMusicalValueKind[]) {
          for (const bars of [0.1, 1 / 64, 0.12345678, 0.00000001]) {
            const text = formatAudioMusicalValue(bars, numerator, denominator, kind)
            expect(parseAudioMusicalValue(text, numerator, denominator, kind, 0, 100)).toBeCloseTo(
              bars,
              9
            )
          }
        }
      }
    }
  })
  it("carries from the second sixteenth into the next beat in 4/8 and 3/8", () => {
    for (const numerator of [3, 4]) {
      const step = 8 / (numerator * 16)
      expect(formatAudioMusicalValue(step, numerator, 8, "position")).toBe("1.1.2")
      expect(formatAudioMusicalValue(step * 2, numerator, 8, "position")).toBe("1.2.1")
      expect(parseAudioMusicalValue("1.2.1", numerator, 8, "position", 0, 100)).toBeCloseTo(
        step * 2,
        10
      )
      expect(Number.isNaN(parseAudioMusicalValue("1.1.3", numerator, 8, "position", 0, 100))).toBe(
        true
      )
    }
  })
  it("rejects malformed or out-of-range positions so the editor can cancel the transaction", () => {
    for (const text of [
      "",
      "1.0.1",
      "0.1.1",
      "1.4.1",
      "1.1.0",
      "1.1.5",
      "1.1.1junk",
      "-1",
      "101",
      "Infinity",
    ]) {
      expect(Number.isNaN(parseAudioMusicalValue(text, 3, 4, "position", 0, 100))).toBe(true)
    }
    for (const text of ["0.3.0", "0.0.4", "-0.5", "1.0.0extra"]) {
      expect(Number.isNaN(parseAudioMusicalValue(text, 3, 4, "duration", 0, 100))).toBe(true)
    }
    expect(Number.isNaN(parseAudioMusicalValue("1.1.1", 4, 4, "position", 0.25, 100))).toBe(true)
    expect(Number.isNaN(parseAudioMusicalValue("0.0.0", 4, 4, "duration", 0.001, 100))).toBe(true)
    expect(Number.isNaN(parseAudioMusicalValue("1.1.1", 0, 4, "position", 0, 100))).toBe(true)
    expect(Number.isNaN(parseAudioMusicalValue("1.1.1", 4, 3, "position", 0, 100))).toBe(true)
  })
})
