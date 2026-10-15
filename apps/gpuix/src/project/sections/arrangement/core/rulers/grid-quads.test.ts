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
  const values = packGridQuads(lines, 10, 20, 80, 2)
  expect(Array.from(values.major)).toEqual([0, 0, 2, 80])
  expect(Array.from(values.minor)).toEqual([5, 0, 1, 80])
  const uniform = packGridQuads(lines, 10, 20, 80, 2, true)
  expect(Array.from(uniform.major)).toEqual([0, 0, 2, 80, 5, 0, 1, 80])
  expect(Array.from(uniform.minor)).toEqual([])
  expect(Array.from(packGridQuads(lines, 10, 0, 80, 2).major)).toEqual([])
})
