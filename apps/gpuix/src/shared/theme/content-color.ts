/**
 * Track, group and clip colors are stored as theme tokens (`var(--chart-1)`),
 * exactly like the Web project, so a theme switch recolors existing content.
 * They are resolved against the active theme only when painted.
 */
import { colorMix } from "./color-mix"
import type { DerivedThemeColors } from "./colors"

/** Colors offered by track and clip color menus, in menu order. */
export const CONTENT_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

/**
 * `var(--name)` resolves to the matching theme color; an unknown token falls
 * back to `primary`; any other string is already a concrete color.
 */
export function resolveContentColor(color: string, colors: DerivedThemeColors): string {
  const match = /^var\(--([a-z0-9-]+)\)$/i.exec(color)
  if (!match) return color
  const key = match[1].replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
  return Object.hasOwn(colors, key) ? colors[key as keyof DerivedThemeColors] : colors.primary
}

/** Mix resolved content color with the preset's paper using the injected recipe. */
export function contentFill(color: string, colors: DerivedThemeColors, paperTint: number): string {
  // 100 is the percentage complement; only the injected tint is a visual choice.
  return colorMix(resolveContentColor(color, colors), 100 - paperTint, colors.arrangementClipPaper)
}
