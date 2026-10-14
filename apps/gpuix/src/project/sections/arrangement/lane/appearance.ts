import type { Theme } from "@/shared/theme/ThemeProvider"

export function resolveLaneColor(color: string, theme: Theme): string {
  switch (color) {
    case "var(--chart-1)":
      return theme.colors.chart1
    case "var(--chart-2)":
      return theme.colors.chart2
    case "var(--chart-3)":
      return theme.colors.chart3
    case "var(--chart-4)":
      return theme.colors.chart4
    case "var(--chart-5)":
      return theme.colors.chart5
    case "var(--primary)":
      return theme.colors.primary
    default:
      return color.startsWith("var(") ? theme.colors.primary : color
  }
}
