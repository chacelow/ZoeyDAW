import { expect, test } from "bun:test"
import { adjacentMarker, rulerLabel } from "./geometry"
import type { Marker } from "@/project/model/types"

const meters = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 4, denominator: 8 },
  { numerator: 7, denominator: 8 },
]

test("ruler labels preserve actual sixteenths-per-beat across five meters", () => {
  let seed = 91321
  for (let i = 0; i < 1000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const meter = meters[i % meters.length]
    const bar = 1 + (seed % 1000)
    const beat = seed % meter.numerator
    const subdivisions = 16 / meter.denominator
    const subdivision = seed % subdivisions
    const position = bar + (beat + subdivision / subdivisions) / meter.numerator
    const expected = subdivision
      ? `${bar}.${beat + 1}.${subdivision + 1}`
      : beat
        ? `${bar}.${beat + 1}`
        : String(bar)
    expect(rulerLabel(position, meter.numerator, meter.denominator)).toBe(expected)
  }
  expect([2.625, 2.75, 2.875, 3, 3.125, 3.25].map(bar => rulerLabel(bar, 4, 8))).toEqual([
    "2.3.2",
    "2.4",
    "2.4.2",
    "3",
    "3.1.2",
    "3.2",
  ])
})

test("locator navigation finds the closest strict neighbor without mutating source order", () => {
  let seed = 71219
  for (let iteration = 0; iteration < 500; iteration++) {
    const markers: Marker[] = []
    for (let i = 0; i < 17; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      markers.push({ id: `marker-${i}`, label: `Locator ${i}`, bar: 1 + (seed % 100) })
    }
    const source = structuredClone(markers)
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const position = 1 + (seed % 100)
    const before = markers.filter(marker => marker.bar < position - 1e-6)
    const after = markers.filter(marker => marker.bar > position + 1e-6)
    const previous = adjacentMarker(markers, position, -1)
    const next = adjacentMarker(markers, position, 1)
    expect(previous?.bar ?? null).toBe(
      before.length ? Math.max(...before.map(marker => marker.bar)) : null
    )
    expect(next?.bar ?? null).toBe(
      after.length ? Math.min(...after.map(marker => marker.bar)) : null
    )
    if (previous) expect(before.filter(marker => marker.bar === previous.bar).at(-1)).toBe(previous)
    if (next) expect(after.find(marker => marker.bar === next.bar)).toBe(next)
    expect(markers).toEqual(source)
  }
  expect(adjacentMarker([], 1, -1)).toBeNull()
  expect(adjacentMarker([{ id: "same", label: "Same", bar: 3 }], 3, 1)).toBeNull()
})
