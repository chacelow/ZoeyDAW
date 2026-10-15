/**
 * Theme color model, ported from `apps/web/src/index.css`.
 *
 * `ThemeColors` is the set of tokens a preset provides (see `presets.data.ts`,
 * generated from the Web sources). `derive()` adds every role the Web theme
 * computes from them with `color-mix()` / `light-dark()`, resolved once
 * through `colorMix()` because gpuix has no CSS engine to evaluate them.
 *
 * Shared by every gpuix module in this app: do not hand-roll a second color
 * table or a second derivation in a feature slice.
 */
import { colorMix } from "./color-mix"
import type { WEB_COLOR_TOKENS } from "./web-tokens"

/** One preset's colors for one scheme; field ↔ Web token map in `web-tokens.ts`. */
export type ThemeColors = { readonly [Field in keyof typeof WEB_COLOR_TOKENS]: string }

export type ColorScheme = "light" | "dark"

/** Web `:root` constants that no preset and no scheme overrides. */
const ARRANGEMENT_CLIP_SELECTED = "oklch(87% 0.05 220deg)"
const ARRANGEMENT_CLIP_PAPER = "oklch(97% 0.005 90deg)"

export interface DerivedThemeColors extends ThemeColors {
  /** Web `--arrangement-clip-selected`; same in every preset and scheme. */
  arrangementClipSelected: string
  /** Web `--arrangement-clip-paper`; same in every preset and scheme. */
  arrangementClipPaper: string
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

export function derive(base: ThemeColors, scheme: ColorScheme): DerivedThemeColors {
  const lightDark = (light: string, dark: string) => (scheme === "light" ? light : dark)
  const arrangementClipInk = lightDark(base.foreground, base.card)
  return {
    ...base,
    arrangementClipSelected: ARRANGEMENT_CLIP_SELECTED,
    arrangementClipPaper: ARRANGEMENT_CLIP_PAPER,
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
