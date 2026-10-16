import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { DEFAULT_DESIGN_DETAILS, type DesignDetails } from "@/shared/theme/design-details"
import { DEFAULT_COLOR_RECIPES } from "./color-recipes"
import type { ColorRecipes } from "./color-recipes"

export type CardSize = "default" | "sm" | "controls" | "project"
export interface CardDesignTokens {
  readonly radius: number
  readonly inset: number
  readonly gap: number
  readonly headerGap: number
  readonly contentGap: number
  readonly insetOwner: "parts" | "shell"
  readonly hover: "none" | "accent"
}
export interface DesignTokens {
  readonly colorRecipes: ColorRecipes
  readonly typography: {
    readonly numberFontFamily: string
    readonly weights: { readonly medium: number; readonly semibold: number }
  }
  readonly shape: {
    readonly controlRadius: number
    readonly controlBorderWidth: number
    readonly toggleRadius: number
    readonly listRowRadius: number
    readonly cardBorderWidth: number
    readonly panelRadius: number
    readonly panelBorderWidth: number
    readonly indicatorRadius: number
    readonly indicatorStrokeWidth: number
    readonly separatorWidth: number
    readonly focusRingWidth: number
  }
  readonly input: { readonly paddingInline: number }
  readonly cards: Readonly<Record<CardSize, CardDesignTokens>>
  readonly spacing: {
    readonly rootInset: number
    readonly cardGroupGap: number
    readonly stackGap: number
    readonly joinedGroupGap: number
    readonly toolbarGap: Readonly<Record<"default" | "transport", number>>
  }
  readonly menu: {
    readonly radius: number
    readonly borderWidth: number
    readonly inset: number
    readonly labelInset: number
    readonly maxWidth: number
    readonly maxHeight: number
    readonly width: number
    readonly dropdownSeparatorInset: number
    readonly contextSeparatorInset: number
  }
  readonly popover: {
    readonly radius: number
    readonly borderWidth: number
    readonly inset: number
    readonly gap: number
    readonly headerGap: number
    readonly width: number
  }
  readonly settings: {
    readonly shellWidth: number
    readonly shellHeight: number
    readonly navigationWidth: number
    readonly presetGrid: {
      readonly columnWidth: number
      readonly swatchHeight: number
      readonly scrollHeight: number
    }
    readonly paddingInline: number
    readonly itemGap: number
    readonly headerGap: number
    readonly headerInset: number
    readonly headerTextGap: number
    readonly navigationGap: number
    readonly navigationInset: number
    readonly contentInset: number
  }
  readonly tabs: {
    readonly width: number
    readonly itemGap: number
    readonly contentGap: number
    readonly footerRadius: number
    readonly footerJoinedGroupGap: number
  }
  readonly overlay: DesignDetails["overlay"]
  readonly dragPreview: DesignDetails["dragPreview"]
  readonly empty: DesignDetails["empty"]
  readonly loading: DesignDetails["loading"]
  readonly toast: DesignDetails["toast"]
  readonly states: DesignDetails["states"]
  readonly editor: DesignDetails["editor"]
  readonly dragPad: DesignDetails["dragPad"]
  readonly progress: DesignDetails["progress"]
  readonly motion: DesignDetails["motion"]
  readonly cursors: DesignDetails["cursors"]
  readonly icon: DesignDetails["icon"]
  readonly feedback: DesignDetails["feedback"]
  readonly dialog: DesignDetails["dialog"]
}

export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  colorRecipes: DEFAULT_COLOR_RECIPES,
  typography: { numberFontFamily: "Menlo", weights: { medium: 500, semibold: 600 } },
  shape: {
    controlRadius: 3,
    controlBorderWidth: 1,
    toggleRadius: 2,
    listRowRadius: 0,
    cardBorderWidth: 1,
    panelRadius: 7,
    separatorWidth: 1,
    panelBorderWidth: PROJECT_METRICS.panelBorder,
    focusRingWidth: 1,
    indicatorStrokeWidth: 1,
    indicatorRadius: CONTROL_METRICS.default["--spacing-control-track"] / 2,
  },
  input: { paddingInline: 6 },
  cards: {
    default: {
      radius: 8,
      inset: 16,
      gap: 16,
      headerGap: 2,
      contentGap: 0,
      insetOwner: "parts",
      hover: "none",
    },
    sm: {
      radius: 6,
      inset: 12,
      gap: 12,
      headerGap: 2,
      contentGap: 0,
      insetOwner: "parts",
      hover: "none",
    },
    controls: {
      radius: 1,
      inset: 4,
      gap: 4,
      headerGap: 2,
      contentGap: 4,
      insetOwner: "parts",
      hover: "none",
    },
    project: {
      radius: 6,
      inset: 12,
      gap: 4,
      headerGap: 2,
      contentGap: 4,
      insetOwner: "shell",
      hover: "accent",
    },
  },
  spacing: {
    rootInset: PROJECT_METRICS.panelGap,
    cardGroupGap: PROJECT_METRICS.panelGap,
    stackGap: CONTROL_METRICS.default["--spacing-control-track-gap"],
    joinedGroupGap: 0,
    toolbarGap: {
      default: CONTROL_METRICS.default["--spacing-control-gap"],
      transport: CONTROL_METRICS.transport["--spacing-control-gap"],
    },
  },
  menu: {
    radius: 4,
    borderWidth: 1,
    inset: 4,
    labelInset: 6,
    maxWidth: 320,
    maxHeight: 300,
    width: CONTROL_METRICS.default["--spacing-control-track"] * 10,
    dropdownSeparatorInset: 3,
    contextSeparatorInset: 4,
  },
  popover: {
    radius: 4,
    borderWidth: 1,
    inset: 8,
    gap: 6,
    headerGap: 4,
    width: CONTROL_METRICS.default["--spacing-control-track"] * 12,
  },
  settings: {
    shellWidth: 720,
    shellHeight: 520,
    navigationWidth: 168,
    presetGrid: {
      columnWidth: PROJECT_METRICS.identityWidth * 2,
      swatchHeight: CONTROL_METRICS.default["--spacing-control-track"] * 2,
      scrollHeight: PROJECT_METRICS.defaultTrackHeight * 4,
    },
    paddingInline: 8,
    itemGap: 6,
    headerGap: 8,
    headerInset: 12,
    headerTextGap: 4,
    navigationGap: 2,
    navigationInset: 8,
    contentInset: 16,
  },
  tabs: { width: 120, itemGap: 4, contentGap: 8, footerRadius: 0, footerJoinedGroupGap: 0 },
  ...DEFAULT_DESIGN_DETAILS,
}
