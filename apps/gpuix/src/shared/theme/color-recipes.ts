import { colorMix } from "./color-mix"
import type { ThemeColors } from "./colors"

export interface ColorRecipes {
  readonly contentPaperTint: number
  readonly editorShell: number
  readonly canvasScrollbar: number
  readonly canvasScrollbarHover: number
  readonly canvasScrollbarActive: number
  readonly scrollbarTrack: number
  readonly arrangementSurfaceSelected: number
  readonly arrangementSurface: number
  readonly arrangementSurfaceAlt: number
  readonly arrangementFadeMask: number
  readonly destructive: {
    readonly active: { readonly light: number; readonly dark: number }
    readonly highlight: { readonly light: number; readonly dark: number }
    readonly focusBorder: number
    readonly focusOutline: { readonly light: number; readonly dark: number }
  }
  readonly listRowHover: number
  readonly dialogBackdrop: number
  readonly editor: {
    readonly overviewViewport: number
    readonly audioLoop: number
    readonly markerHover: number
    readonly marquee: number
    readonly pianoIvoryDark: number
    readonly pianoEbony: number
    readonly velocityNoteBorder: number
    readonly velocitySelected: { readonly base: number; readonly range: number }
    readonly velocityUnselected: { readonly base: number; readonly range: number }
  }
  readonly aliases: {
    readonly arrangementLine: {
      readonly light: keyof ThemeColors
      readonly dark: keyof ThemeColors
    }
    readonly arrangementAutomation: keyof ThemeColors
    readonly arrangementVolume: keyof ThemeColors
    readonly arrangementMeterGood: keyof ThemeColors
    readonly arrangementMeterWarn: {
      readonly light: keyof ThemeColors
      readonly dark: keyof ThemeColors
    }
    readonly arrangementMeterDanger: keyof ThemeColors
    readonly arrangementMeterPeak: keyof ThemeColors
    readonly arrangementClipInk: {
      readonly light: keyof ThemeColors
      readonly dark: keyof ThemeColors
    }
  }
}

export const DEFAULT_COLOR_RECIPES: ColorRecipes = {
  contentPaperTint: 32,
  editorShell: 30,
  canvasScrollbar: 10,
  canvasScrollbarHover: 18,
  canvasScrollbarActive: 26,
  scrollbarTrack: 4,
  arrangementSurfaceSelected: 78,
  arrangementSurface: 86,
  arrangementSurfaceAlt: 84,
  arrangementFadeMask: 50,
  destructive: {
    active: { light: 10, dark: 20 },
    highlight: { light: 20, dark: 30 },
    focusBorder: 40,
    focusOutline: { light: 20, dark: 40 },
  },
  listRowHover: 90,
  dialogBackdrop: 10,
  editor: {
    overviewViewport: 12,
    audioLoop: 45,
    markerHover: 30,
    marquee: 20,
    pianoIvoryDark: 75,
    pianoEbony: 80,
    velocityNoteBorder: 60,
    velocitySelected: { base: 55, range: 45 },
    velocityUnselected: { base: 35, range: 65 },
  },
  aliases: {
    arrangementLine: { light: "border", dark: "muted" },
    arrangementAutomation: "destructive",
    arrangementVolume: "chart2",
    arrangementMeterGood: "chart2",
    arrangementMeterWarn: { light: "chart4", dark: "chart3" },
    arrangementMeterDanger: "destructive",
    arrangementMeterPeak: "mutedForeground",
    arrangementClipInk: { light: "foreground", dark: "card" },
  },
}

export function velocityNoteFill(
  color: string,
  velocity: number,
  backdrop: string,
  selected: boolean,
  recipe: ColorRecipes["editor"]
): string {
  const scale = selected ? recipe.velocitySelected : recipe.velocityUnselected
  return colorMix(color, scale.base + (velocity / 127) * scale.range, backdrop)
}

export function velocityNoteBorder(
  color: string,
  background: string,
  recipe: ColorRecipes["editor"]
): string {
  return colorMix(color, recipe.velocityNoteBorder, background)
}
