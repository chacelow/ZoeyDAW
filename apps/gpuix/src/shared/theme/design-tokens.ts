import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"
import type { ControlMetrics } from "@/shared/theme/metrics/config"
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
  readonly dock: {
    readonly stripHeight: number
    readonly tabHeight: Readonly<Record<"small" | "default" | "large", number>>
    readonly borderSize: number
    readonly activeIndicatorWidth: number
    readonly tabMaxWidth: number
    readonly compactActionsBelow: number
    readonly edgeFraction: number
    readonly edgeOverlayOpacity: number
    readonly centerOverlayOpacity: number
    readonly insertionOpacity: number
    readonly minimumSize: number
    readonly demoHeight: number
  }
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
    readonly indicatorRadius: number
    readonly indicatorStrokeWidth: number
    readonly separatorWidth: number
    readonly focusRingWidth: number
  }
  readonly input: { readonly paddingInline: number; readonly hoverMutedPercent: number }
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
    readonly maxWidth: number
    readonly maxHeight: number
    readonly width: number
    readonly separatorInset: number
    readonly rowHeight: number
    readonly rowInset: number
    readonly rowGap: number
    readonly swatchRingWidth: number
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
    readonly footerJoinedGroupGap: number
  }
  readonly trackCreationColors: DesignDetails["trackCreationColors"]
  readonly overlay: DesignDetails["overlay"]
  readonly dragPreview: DesignDetails["dragPreview"]
  readonly empty: DesignDetails["empty"]
  readonly loading: DesignDetails["loading"]
  readonly toast: DesignDetails["toast"]
  readonly states: DesignDetails["states"]
  readonly editor: DesignDetails["editor"]
  readonly dragPad: DesignDetails["dragPad"]
  readonly grid: DesignDetails["grid"]
  readonly fader: DesignDetails["fader"]
  readonly treeRow: DesignDetails["treeRow"]
  readonly switch: DesignDetails["switch"]
  readonly knob: DesignDetails["knob"]
  readonly progress: DesignDetails["progress"]
  readonly motion: DesignDetails["motion"]
  readonly cursors: DesignDetails["cursors"]
  readonly icon: DesignDetails["icon"]
  readonly feedback: DesignDetails["feedback"]
  readonly dialog: DesignDetails["dialog"]
}
export function createDockTokens(control: ControlMetrics): DesignTokens["dock"] {
  const unit = control["--spacing-control-track"]
  const tabHeight = { small: unit, default: unit * 2, large: unit * 3 }
  return {
    stripHeight: tabHeight.default,
    tabHeight,
    borderSize: unit * 20,
    activeIndicatorWidth: 2,
    tabMaxWidth: unit * 12,
    compactActionsBelow: unit * 18,
    edgeFraction: 0.2,
    edgeOverlayOpacity: 0.3,
    centerOverlayOpacity: 0.18,
    insertionOpacity: 0.8,
    minimumSize: unit * 4,
    demoHeight: unit * 24,
  }
}


export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  dock: createDockTokens(CONTROL_METRICS.default),
  colorRecipes: DEFAULT_COLOR_RECIPES,
  typography: { numberFontFamily: "Menlo", weights: { medium: 500, semibold: 600 } },
  shape: {
    controlRadius: 0,
    controlBorderWidth: 1,
    toggleRadius: 0,
    listRowRadius: 0,
    cardBorderWidth: 1,
    separatorWidth: 1,
    focusRingWidth: 1,
    indicatorStrokeWidth: 1,
    indicatorRadius: CONTROL_METRICS.default["--spacing-control-track"] / 2,
  },
  input: { paddingInline: 6, hoverMutedPercent: 90 },
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
      inset: CONTROL_METRICS.default["--spacing-control-track-gap"],
      gap: CONTROL_METRICS.default["--spacing-control-track-gap"],
      headerGap: CONTROL_METRICS.default["--spacing-control-gap"],
      contentGap: CONTROL_METRICS.default["--spacing-control-track-gap"],
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
    maxWidth: 320,
    maxHeight: 300,
    width: CONTROL_METRICS.default["--spacing-control-track"] * 10,
    separatorInset: 4,
    rowHeight:
      CONTROL_METRICS.default["--spacing-control-track"] +
      CONTROL_METRICS.default["--spacing-control-track-pad"] * 2,
    rowInset: CONTROL_METRICS.default["--spacing-control-track-pad"],
    rowGap: CONTROL_METRICS.default["--spacing-control-track-gap"],
    swatchRingWidth: 2,
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
      columnWidth: CONTROL_METRICS.default["--spacing-control-track"] * 8,
      swatchHeight: CONTROL_METRICS.default["--spacing-control-track"] * 2,
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
  tabs: { width: 120, itemGap: 4, contentGap: 8, footerJoinedGroupGap: 0 },
  ...DEFAULT_DESIGN_DETAILS,
}

export function createDesignTokens(control: ControlMetrics): DesignTokens {
  return {
    ...DEFAULT_DESIGN_TOKENS,
    dock: createDockTokens(control),
    cards: {
      ...DEFAULT_DESIGN_TOKENS.cards,
      controls: {
        ...DEFAULT_DESIGN_TOKENS.cards.controls,
        inset: control["--spacing-control-track-gap"],
        gap: control["--spacing-control-track-gap"],
        headerGap: control["--spacing-control-gap"],
        contentGap: control["--spacing-control-track-gap"],
      },
    },
  }
}
