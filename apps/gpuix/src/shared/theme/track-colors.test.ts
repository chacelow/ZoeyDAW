import { expect, test } from "bun:test"
import { parse } from "culori"
import { darkColors, lightColors } from "./colors"

for (const [appearance, colors] of [
  ["light", lightColors],
  ["dark", darkColors],
] as const) {
  test(`${appearance} defines parseable semantic meter and track surface colors`, () => {
    for (const color of [
      colors.meterGood,
      colors.meterWarn,
      colors.meterDanger,
      colors.meterPeak,
      colors.arrangementFadeMask,
      colors.arrangementLine,
    ]) {
      expect(color.length).toBeGreaterThan(0)
      expect(parse(color)).toBeDefined()
    }
    expect(colors.meterGood).not.toBe(colors.meterWarn)
    expect(colors.meterWarn).not.toBe(colors.meterDanger)
    expect(parse(colors.arrangementFadeMask)?.alpha).toBe(0.5)
    expect(colors.arrangementLine).not.toBe(colors.meterPeak)
  })
}
