import { colorMix } from "./color-mix"
import { DEFAULT_COLOR_RECIPES } from "./color-recipes"
import type { ColorRecipes } from "./color-recipes"

export interface ThemeColors {
  readonly background: string
  readonly foreground: string
  readonly card: string
  readonly cardForeground: string
  readonly popover: string
  readonly popoverForeground: string
  readonly primary: string
  readonly primaryForeground: string
  readonly secondary: string
  readonly secondaryForeground: string
  readonly muted: string
  readonly mutedForeground: string
  readonly accent: string
  readonly accentForeground: string
  readonly destructive: string
  readonly success: string
  readonly border: string
  readonly input: string
  readonly ring: string
  readonly chart1: string
  readonly chart2: string
  readonly chart3: string
  readonly chart4: string
  readonly chart5: string
  readonly arrangementClipSelected: string
  readonly arrangementClipPaper: string
}

export type ColorScheme = "light" | "dark"

export interface DerivedThemeColors extends ThemeColors {
  editorShell: string
  canvasScrollbar: string
  canvasScrollbarHover: string
  canvasScrollbarActive: string
  scrollbarTrack: string
  arrangementSurfaceSelected: string
  arrangementSurface: string
  arrangementSurfaceAlt: string
  arrangementLine: string
  arrangementAutomation: string
  arrangementVolume: string
  arrangementMeterGood: string
  arrangementMeterWarn: string
  arrangementMeterDanger: string
  arrangementMeterPeak: string
  arrangementClipInk: string
  arrangementFadeMask: string
  destructiveActive: string
  destructiveHighlight: string
  destructiveFocusBorder: string
  destructiveFocusOutline: string
  listRowHover: string
  dialogBackdrop: string
  editorOverviewViewport: string
  editorAudioLoop: string
  editorMarkerHover: string
  editorMarquee: string
  pianoIvory: string
  pianoEbony: string
}

export function derive(
  base: ThemeColors,
  scheme: ColorScheme,
  recipes: ColorRecipes = DEFAULT_COLOR_RECIPES
): DerivedThemeColors {
  const aliases = recipes.aliases
  const arrangementClipInk = base[aliases.arrangementClipInk[scheme]]
  const destructive = recipes.destructive
  const editor = recipes.editor
  return {
    ...base,
    editorShell: colorMix(base.muted, recipes.editorShell, base.background),
    canvasScrollbar: colorMix(base.foreground, recipes.canvasScrollbar, "transparent"),
    canvasScrollbarHover: colorMix(base.foreground, recipes.canvasScrollbarHover, "transparent"),
    canvasScrollbarActive: colorMix(base.foreground, recipes.canvasScrollbarActive, "transparent"),
    scrollbarTrack: colorMix(base.foreground, recipes.scrollbarTrack, base.background),
    arrangementSurfaceSelected: colorMix(
      base.card,
      recipes.arrangementSurfaceSelected,
      base.foreground
    ),
    arrangementSurface: colorMix(base.card, recipes.arrangementSurface, base.foreground),
    arrangementSurfaceAlt: colorMix(base.card, recipes.arrangementSurfaceAlt, base.foreground),
    arrangementLine: base[aliases.arrangementLine[scheme]],
    arrangementAutomation: base[aliases.arrangementAutomation],
    arrangementVolume: base[aliases.arrangementVolume],
    arrangementMeterGood: base[aliases.arrangementMeterGood],
    arrangementMeterWarn: base[aliases.arrangementMeterWarn[scheme]],
    arrangementMeterDanger: base[aliases.arrangementMeterDanger],
    arrangementMeterPeak: base[aliases.arrangementMeterPeak],
    arrangementClipInk,
    arrangementFadeMask: colorMix(arrangementClipInk, recipes.arrangementFadeMask, "transparent"),
    destructiveActive: colorMix(base.destructive, destructive.active[scheme], "transparent"),
    destructiveHighlight: colorMix(base.destructive, destructive.highlight[scheme], "transparent"),
    destructiveFocusBorder: colorMix(base.destructive, destructive.focusBorder, "transparent"),
    destructiveFocusOutline: colorMix(
      base.destructive,
      destructive.focusOutline[scheme],
      "transparent"
    ),
    listRowHover: colorMix(base.muted, recipes.listRowHover, base.foreground),
    dialogBackdrop: colorMix(base.foreground, recipes.dialogBackdrop, "transparent"),
    editorOverviewViewport: colorMix(base.primary, editor.overviewViewport, "transparent"),
    editorAudioLoop: colorMix(base.primary, editor.audioLoop, "transparent"),
    editorMarkerHover: colorMix(base.primary, editor.markerHover, "transparent"),
    editorMarquee: colorMix(base.primary, editor.marquee, "transparent"),
    pianoIvory:
      scheme === "dark"
        ? colorMix(base.foreground, editor.pianoIvoryDark, base.background)
        : base.background,
    pianoEbony:
      scheme === "dark"
        ? colorMix(base.background, editor.pianoEbony, base.foreground)
        : colorMix(base.foreground, editor.pianoEbony, base.background),
  }
}
