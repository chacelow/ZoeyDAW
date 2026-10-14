import { describe, expect, it } from "bun:test"
import { musicalTicks, timeTickLabel, timeTicks } from "./timeline-ticks"

describe("visible timeline ruler ticks", () => {
  it("retains demo bar positions and clips ticks to the viewport", () => {
    expect(
      musicalTicks({ bars: 128, visibleStartBar: 1, visibleEndBar: 17, pxPerBar: 24 })
    ).toEqual([
      { value: 1, left: 0 },
      { value: 5, left: 96 },
      { value: 9, left: 192 },
      { value: 13, left: 288 },
    ])
    const scrolled = musicalTicks({
      bars: 10_016,
      visibleStartBar: 129,
      visibleEndBar: 145,
      pxPerBar: 24,
    })
    expect(scrolled).toEqual([
      { value: 129, left: 3072 },
      { value: 133, left: 3168 },
      { value: 137, left: 3264 },
      { value: 141, left: 3360 },
    ])
  })

  it("renders bounded finite musical and time coordinates for very long songs and tiny scales", () => {
    const axis = {
      bars: 10_000_016,
      visibleStartBar: 1,
      visibleEndBar: 10_000_017,
      pxPerBar: 0.001,
    }
    const musical = musicalTicks(axis)
    const seconds = timeTicks({ ...axis, bpm: 120, numerator: 4, denominator: 4 })
    for (const ticks of [musical, seconds]) {
      expect(ticks.length).toBeGreaterThan(0)
      expect(ticks.length).toBeLessThanOrEqual(256)
      expect(ticks.every(tick => Number.isFinite(tick.value) && Number.isFinite(tick.left))).toBe(
        true
      )
      expect(ticks.every((tick, index) => index === 0 || tick.value > ticks[index - 1].value)).toBe(
        true
      )
    }
    expect(musical.at(-1)!.value).toBeGreaterThan(9_000_000)
  })

  it("uses signature and tempo to label seconds at their actual musical position", () => {
    const axis = { bars: 128, visibleStartBar: 1, visibleEndBar: 65, pxPerBar: 160 }
    const fourFour = timeTicks({ ...axis, bpm: 120, numerator: 4, denominator: 4 })
    const sixEight = timeTicks({ ...axis, bpm: 120, numerator: 6, denominator: 8 })
    expect(fourFour[1]).toEqual({ value: 1, left: 80 })
    expect(sixEight[1].value).toBe(1)
    expect(sixEight[1].left).toBeCloseTo(160 / 1.5)
    expect(timeTickLabel(62)).toBe("1:02")
  })

  it("does not allocate over an immense finite span or emit infinite coordinates", () => {
    const axis = { bars: 1e300, visibleStartBar: 1, visibleEndBar: 1e300, pxPerBar: 1e-290 }
    for (const ticks of [
      musicalTicks(axis),
      timeTicks({ ...axis, bpm: 120, numerator: 4, denominator: 4 }),
    ]) {
      expect(ticks.length).toBeLessThanOrEqual(256)
      expect(ticks.every(tick => Number.isFinite(tick.value) && Number.isFinite(tick.left))).toBe(
        true
      )
    }
    expect(musicalTicks({ ...axis, pxPerBar: Number.MIN_VALUE }).length).toBeLessThanOrEqual(256)
  })

  it("stops at unrepresentable pixels without losing valid tick positions", () => {
    const axis = { bars: 8, visibleStartBar: 1, visibleEndBar: 9, pxPerBar: 1e308 }
    expect(musicalTicks(axis)).toEqual([
      { value: 1, left: 0 },
      { value: 2, left: 1e308 },
    ])
    const seconds = timeTicks({ ...axis, bpm: 120, numerator: 4, denominator: 4 })
    expect(seconds.every(tick => Number.isFinite(tick.left))).toBe(true)
  })

  it("shows milliseconds at fast tempos and narrow musical signatures", () => {
    const ticks = timeTicks({
      bars: 128,
      visibleStartBar: 1,
      visibleEndBar: 5,
      pxPerBar: 240,
      bpm: 999,
      numerator: 1,
      denominator: 32,
    })
    expect(ticks.slice(0, 2).map(tick => tick.value)).toEqual([0, 0.005])
    expect(timeTickLabel(0.005)).toBe("0:00.005")
    expect(timeTickLabel(59.9999)).toBe("1:00")
  })
})
