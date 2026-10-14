/**
 * Theme color tokens, ported from `apps/web/src/index.css`.
 *
 * Values are copied verbatim from the Web theme's `oklch()` literals; gpuix
 * accepts oklch strings natively, so the base tokens pass through unchanged.
 * Tokens derived from `color-mix()` are resolved once at module load through
 * `colorMix()`, since gpuix has no CSS engine to evaluate them at paint time.
 *
 * Shared by every gpuix module in this app: do not hand-roll a second color
 * table in a feature slice.
 */
import { colorMix } from "./color-mix"

export interface ThemeColors {
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  border: string
  input: string
  ring: string
  chart1: string
  chart2: string
  chart3: string
  chart4: string
  chart5: string
  arrangementClipSelected: string
  arrangementClipPaper: string
  meterGood: string
  meterWarn: string
  meterDanger: string
  meterPeak: string
  arrangementFadeMask: string
  arrangementLine: string
}

const lightBase: ThemeColors = {
  background: "oklch(100% 0 0deg)",
  foreground: "oklch(14.5% 0 0deg)",
  card: "oklch(100% 0 0deg)",
  cardForeground: "oklch(14.5% 0 0deg)",
  popover: "oklch(100% 0 0deg)",
  popoverForeground: "oklch(14.5% 0 0deg)",
  primary: "oklch(20.5% 0 0deg)",
  primaryForeground: "oklch(98.5% 0 0deg)",
  secondary: "oklch(97% 0 0deg)",
  secondaryForeground: "oklch(20.5% 0 0deg)",
  muted: "oklch(97% 0 0deg)",
  mutedForeground: "oklch(55.6% 0 0deg)",
  accent: "oklch(97% 0 0deg)",
  accentForeground: "oklch(20.5% 0 0deg)",
  destructive: "oklch(57.7% 0.245 27.325deg)",
  border: "oklch(92.2% 0 0deg)",
  input: "oklch(92.2% 0 0deg)",
  ring: "oklch(70.8% 0 0deg)",
  chart1: "oklch(64.6% 0.222 41.116deg)",
  chart2: "oklch(60% 0.118 184.704deg)",
  chart3: "oklch(39.8% 0.07 227.392deg)",
  chart4: "oklch(82.8% 0.189 84.429deg)",
  chart5: "oklch(76.9% 0.188 70.08deg)",
  arrangementClipSelected: "oklch(87% 0.05 220deg)",
  arrangementClipPaper: "oklch(97% 0.005 90deg)",
  meterGood: "oklch(60% 0.118 184.704deg)",
  meterWarn: "oklch(82.8% 0.189 84.429deg)",
  meterDanger: "oklch(57.7% 0.245 27.325deg)",
  meterPeak: "oklch(55.6% 0 0deg)",
  arrangementFadeMask: "oklch(14.5% 0 0deg / 50%)",
  arrangementLine: "oklch(92.2% 0 0deg)",
}

const darkBase: ThemeColors = {
  ...lightBase,
  background: "oklch(14.5% 0 0deg)",
  foreground: "oklch(98.5% 0 0deg)",
  card: "oklch(20.5% 0 0deg)",
  cardForeground: "oklch(98.5% 0 0deg)",
  popover: "oklch(20.5% 0 0deg)",
  popoverForeground: "oklch(98.5% 0 0deg)",
  primary: "oklch(92.2% 0 0deg)",
  primaryForeground: "oklch(20.5% 0 0deg)",
  secondary: "oklch(26.9% 0 0deg)",
  secondaryForeground: "oklch(98.5% 0 0deg)",
  muted: "oklch(26.9% 0 0deg)",
  mutedForeground: "oklch(70.8% 0 0deg)",
  accent: "oklch(26.9% 0 0deg)",
  accentForeground: "oklch(98.5% 0 0deg)",
  destructive: "oklch(70.4% 0.191 22.216deg)",
  border: "oklch(100% 0 0deg / 10%)",
  input: "oklch(100% 0 0deg / 15%)",
  ring: "oklch(55.6% 0 0deg)",
  chart1: "oklch(48.8% 0.243 264.376deg)",
  chart2: "oklch(69.6% 0.17 162.48deg)",
  chart3: "oklch(76.9% 0.188 70.08deg)",
  chart4: "oklch(62.7% 0.265 303.9deg)",
  chart5: "oklch(64.5% 0.246 16.439deg)",
  meterGood: "oklch(69.6% 0.17 162.48deg)",
  meterWarn: "oklch(76.9% 0.188 70.08deg)",
  meterDanger: "oklch(70.4% 0.191 22.216deg)",
  meterPeak: "oklch(70.8% 0 0deg)",
  arrangementFadeMask: "oklch(20.5% 0 0deg / 50%)",
  arrangementLine: "oklch(26.9% 0 0deg)",
}

export interface DerivedThemeColors extends ThemeColors {
  /** `color-mix(in oklab, muted 30%, background)`. */
  editorShell: string
  /** `color-mix(in oklab, foreground 10%, transparent)`. */
  canvasScrollbar: string
  canvasScrollbarHover: string
  canvasScrollbarActive: string
  /** `color-mix(in oklab, foreground 4%, background)`. */
  scrollbarTrack: string
  /** `color-mix(in oklab, card 78%, foreground)`. */
  arrangementSurfaceSelected: string
  /** `color-mix(in oklab, card 86%, foreground)`; timeline lane background. */
  arrangementSurface: string
  /** `color-mix(in oklab, card 84%, foreground)`; also the ruler, toolbar and track-header background. */
  arrangementSurfaceAlt: string
  /** `light-dark(border, muted)`; grid lines, separators and meter cutouts. */
  arrangementLine: string
  /** `destructive`; automation curves and recording. */
  arrangementAutomation: string
  /** `chart-2`; volume and pan lanes. */
  arrangementVolume: string
  /** `chart-2`. */
  arrangementMeterGood: string
  /** `light-dark(chart-4, chart-3)`. */
  arrangementMeterWarn: string
  /** `destructive`. */
  arrangementMeterDanger: string
  /** `muted-foreground`; meter peak-hold bar. */
  arrangementMeterPeak: string
  /** `light-dark(foreground, card)`; text, waveform and fade stroke drawn on clips. */
  arrangementClipInk: string
  /** `color-mix(in oklab, clip-ink 50%, transparent)`. */
  arrangementFadeMask: string
}

type ColorScheme = "light" | "dark"

function derive(base: ThemeColors, scheme: ColorScheme): DerivedThemeColors {
  const lightDark = (light: string, dark: string) => (scheme === "light" ? light : dark)
  const arrangementClipInk = lightDark(base.foreground, base.card)
  return {
    ...base,
    editorShell: colorMix(base.muted, 30, base.background),
    canvasScrollbar: colorMix(base.foreground, 10, "transparent"),
    canvasScrollbarHover: colorMix(base.foreground, 18, "transparent"),
    canvasScrollbarActive: colorMix(base.foreground, 26, "transparent"),
    scrollbarTrack: colorMix(base.foreground, 4, base.background),
    arrangementSurfaceSelected: colorMix(base.card, 78, base.foreground),
    arrangementSurface: colorMix(base.card, 86, base.foreground),
    arrangementSurfaceAlt: colorMix(base.card, 84, base.foreground),
    arrangementLine: lightDark(base.border, base.muted),
    arrangementAutomation: base.destructive,
    arrangementVolume: base.chart2,
    arrangementMeterGood: base.chart2,
    arrangementMeterWarn: lightDark(base.chart4, base.chart3),
    arrangementMeterDanger: base.destructive,
    arrangementMeterPeak: base.mutedForeground,
    arrangementClipInk,
    arrangementFadeMask: colorMix(arrangementClipInk, 50, "transparent"),
  }
}

export const lightColors: DerivedThemeColors = derive(lightBase, "light")
export const darkColors: DerivedThemeColors = derive(darkBase, "dark")
