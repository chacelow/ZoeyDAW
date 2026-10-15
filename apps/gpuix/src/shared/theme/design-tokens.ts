import { CONTROL_METRICS, PROJECT_METRICS } from "@zoeymind/ui/metrics"

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
    readonly itemRadius: number
    readonly itemPaddingInline: number
    readonly itemPaddingBlock: number
    readonly itemGap: number
    readonly labelInset: number
    readonly selectItemInset: number
  }
  readonly popover: {
    readonly radius: number
    readonly borderWidth: number
    readonly inset: number
    readonly gap: number
    readonly headerGap: number
  }
  readonly settings: {
    readonly paddingInline: number
    readonly itemGap: number
    readonly headerGap: number
    readonly headerInset: number
    readonly headerTextGap: number
    readonly navigationGap: number
    readonly navigationInset: number
    readonly contentInset: number
  }
  readonly tabs: { readonly itemGap: number; readonly contentGap: number }
}

export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  shape: {
    controlRadius: 3,
    controlBorderWidth: 1,
    toggleRadius: 2,
    listRowRadius: 0,
    cardBorderWidth: 1,
    panelRadius: 7,
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
    itemRadius: 2,
    itemPaddingInline: 6,
    itemPaddingBlock: 2,
    itemGap: 6,
    labelInset: 6,
    selectItemInset: 4,
  },
  popover: { radius: 4, borderWidth: 1, inset: 8, gap: 6, headerGap: 4 },
  settings: {
    paddingInline: 8,
    itemGap: 6,
    headerGap: 8,
    headerInset: 12,
    headerTextGap: 4,
    navigationGap: 2,
    navigationInset: 8,
    contentInset: 16,
  },
  tabs: { itemGap: 4, contentGap: 8 },
}
