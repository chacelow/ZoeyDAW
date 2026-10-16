import { expect, test } from "bun:test"
import { packGridQuads } from "./grid-quads"
import type { GridLine } from "./grid-lines"

const lines: GridLine[] = [
  { bar: 1, x: 9, kind: "major" },
  { bar: 2, x: 10, kind: "major" },
  { bar: 2.25, x: 15, kind: "minor" },
  { bar: 3, x: 30, kind: "major" },
]

test("grid quad packing clips the half-open viewport and preserves local line widths", () => {
  const values = packGridQuads(lines, 10, 20, 80, 2, 1)
  expect(Array.from(values.major)).toEqual([0, 0, 2, 80])
  expect(Array.from(values.minor)).toEqual([5, 0, 1, 80])
  const uniform = packGridQuads(lines, 10, 20, 80, 2, 1, true)
  expect(Array.from(uniform.major)).toEqual([0, 0, 2, 80, 5, 0, 1, 80])
  expect(Array.from(uniform.minor)).toEqual([])
  expect(Array.from(packGridQuads(lines, 10, 0, 80, 2, 1).major)).toEqual([])
})

test("minor and major grid strokes consume independently supplied geometry", () => {
  const values = packGridQuads(lines, 10, 20, 80, 4, 3)
  expect(Array.from(values.major)).toEqual([0, 0, 4, 80])
  expect(Array.from(values.minor)).toEqual([5, 0, 3, 80])
})
