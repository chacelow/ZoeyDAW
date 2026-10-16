import { colorMix } from "./color-mix"
import type { DerivedThemeColors } from "./colors"

export const CONTENT_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

export function resolveContentColor(color: string, colors: DerivedThemeColors): string {
  const match = /^var\(--([a-z0-9-]+)\)$/i.exec(color)
  if (!match) return color
  const key = match[1].replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
  return Object.hasOwn(colors, key) ? colors[key as keyof DerivedThemeColors] : colors.primary
}

export function contentFill(color: string, colors: DerivedThemeColors, paperTint: number): string {
  return colorMix(resolveContentColor(color, colors), 100 - paperTint, colors.arrangementClipPaper)
}
