import { describe, expect, test } from "bun:test"
import { getThemePreset } from "./presets"
import { CONTENT_PALETTE, contentFill, resolveContentColor } from "./content-color"
import { DEFAULT_COLOR_RECIPES } from "./color-recipes"

const { light: lightColors, dark: darkColors } = getThemePreset("default").colors

describe("resolveContentColor", () => {
  test("every palette token follows the active theme", () => {
    const keys = ["chart1", "chart2", "chart3", "chart4", "chart5"] as const
    for (const [index, token] of CONTENT_PALETTE.entries()) {
      expect(resolveContentColor(token, lightColors)).toBe(lightColors[keys[index]])
      expect(resolveContentColor(token, darkColors)).toBe(darkColors[keys[index]])
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
  const tint = DEFAULT_COLOR_RECIPES.contentPaperTint
  const fill = contentFill("var(--chart-1)", lightColors, tint)
  expect(fill).toBe(contentFill(lightColors.chart1, lightColors, tint))
  expect(fill).not.toBe(contentFill("var(--chart-2)", lightColors, tint))
  expect(contentFill("var(--chart-1)", darkColors, tint)).not.toBe(fill)
})
