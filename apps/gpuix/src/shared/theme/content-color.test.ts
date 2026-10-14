import { describe, expect, test } from "bun:test"
import { darkColors, lightColors } from "./colors"
import { CONTENT_PALETTE, contentFill, resolveContentColor } from "./content-color"

describe("resolveContentColor", () => {
  test("every palette token follows the active theme", () => {
    for (const [index, token] of CONTENT_PALETTE.entries()) {
      const key = `chart${index + 1}` as const
      expect(resolveContentColor(token, lightColors)).toBe(lightColors[key])
      expect(resolveContentColor(token, darkColors)).toBe(darkColors[key])
    }
  })

  test("multi-word tokens map to their camelCase theme key", () => {
    expect(resolveContentColor("var(--muted-foreground)", darkColors)).toBe(
      darkColors.mutedForeground
    )
  })

  test("unknown tokens fall back to primary; concrete colors pass through", () => {
    expect(resolveContentColor("var(--not-a-token)", lightColors)).toBe(lightColors.primary)
    expect(resolveContentColor("var(--constructor)", lightColors)).toBe(lightColors.primary)
    expect(resolveContentColor("#ff0000", lightColors)).toBe("#ff0000")
  })
})

test("contentFill mixes the resolved color with clip paper, not the raw token", () => {
  const fill = contentFill("var(--chart-1)", lightColors)
  expect(fill).toBe(contentFill(lightColors.chart1, lightColors))
  expect(fill).not.toBe(contentFill("var(--chart-2)", lightColors))
  expect(contentFill("var(--chart-1)", darkColors)).not.toBe(fill)
})
