import { expect, test } from "bun:test"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { meterPosition, meterDbAtPosition } from "./scale"

const scale = DEFAULT_DESIGN_TOKENS.editor.meter.scale

test("Live's measured nonlinear breakpoints and −8 dB thumb placement are preserved", () => {
  const measured = [
    [6, 0],
    [0, 0.1],
    [-6, 0.199],
    [-12, 0.299],
    [-18, 0.398],
    [-24, 0.498],
    [-30, 0.598],
    [-36, 0.685],
    [-42, 0.761],
    [-48, 0.829],
    [-54, 0.888],
    [-60, 0.944],
    [-120, 1],
  ] as const
  for (const [db, position] of measured) {
    expect(meterPosition(db, scale)).toBeCloseTo(position)
    expect(meterDbAtPosition(position, scale)).toBeCloseTo(db)
  }
  expect(meterPosition(-8, scale)).toBeCloseTo(0.199 + 0.1 / 3)
  expect(meterPosition(-Infinity, scale)).toBe(1)
  expect(meterPosition(Infinity, scale)).toBe(0)
})

test("scale inversion round-trips values throughout every segment and respects theme overrides", () => {
  for (let db = -120; db <= 6; db += 0.125)
    expect(meterDbAtPosition(meterPosition(db, scale), scale)).toBeCloseTo(db, 8)
  for (let position = 0; position <= 1; position += 0.005)
    expect(meterPosition(meterDbAtPosition(position, scale), scale)).toBeCloseTo(position, 8)
  const custom = [
    { db: 6, position: 0 },
    { db: 0, position: 0.2 },
    { db: -120, position: 1 },
  ]
  expect(meterPosition(0, custom)).toBe(0.2)
  expect(meterDbAtPosition(0.2, custom)).toBe(0)
})
