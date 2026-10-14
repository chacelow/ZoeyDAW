import { colorMix } from "@/shared/theme/color-mix"
import type { Theme } from "@/shared/theme/ThemeProvider"

const PALETTE_KEYS: Record<string, keyof Theme["colors"]> = {
  "var(--chart-1)": "chart1",
  "var(--chart-2)": "chart2",
  "var(--chart-3)": "chart3",
  "var(--chart-4)": "chart4",
  "var(--chart-5)": "chart5",
  "var(--primary)": "primary",
  "var(--destructive)": "destructive",
  "var(--muted-foreground)": "mutedForeground",
}

export function trackFill(color: string, theme: Theme): string {
  const key = PALETTE_KEYS[color]
  return colorMix(key ? theme.colors[key] : color, 68, theme.colors.arrangementClipPaper)
}
