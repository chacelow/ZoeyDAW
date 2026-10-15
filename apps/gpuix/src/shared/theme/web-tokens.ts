/**
 * Web CSS variable (without `--`) behind each preset-provided `ThemeColors`
 * field. The preset generator (`apps/gpuix/scripts/theme-presets.mjs`) copies
 * exactly these tokens; every other Web preset token is dropped (see README).
 *
 * Kept import-free so Node can load it from the generator with type stripping.
 */
export const WEB_COLOR_TOKENS = {
  background: "background",
  foreground: "foreground",
  card: "card",
  cardForeground: "card-foreground",
  popover: "popover",
  popoverForeground: "popover-foreground",
  primary: "primary",
  primaryForeground: "primary-foreground",
  secondary: "secondary",
  secondaryForeground: "secondary-foreground",
  muted: "muted",
  mutedForeground: "muted-foreground",
  accent: "accent",
  accentForeground: "accent-foreground",
  destructive: "destructive",
  border: "border",
  input: "input",
  ring: "ring",
  chart1: "chart-1",
  chart2: "chart-2",
  chart3: "chart-3",
  chart4: "chart-4",
  chart5: "chart-5",
} as const
