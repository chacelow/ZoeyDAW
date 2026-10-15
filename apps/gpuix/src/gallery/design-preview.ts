import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import type { DesignTokens } from "@/shared/theme/design-tokens"

export type GalleryDesignMode = "default" | "flat" | "spacious"
const defaults = DEFAULT_DESIGN_TOKENS
export const GALLERY_DESIGNS: Readonly<Record<GalleryDesignMode, DesignTokens>> = {
  default: defaults,
  flat: {
    ...defaults,
    shape: {
      ...defaults.shape,
      controlRadius: 0,
      controlBorderWidth: 0,
      toggleRadius: 0,
      listRowRadius: 0,
      cardBorderWidth: 0,
      panelRadius: 0,
      panelBorderWidth: 0,
    },
    cards: {
      default: { ...defaults.cards.default, radius: 0 },
      sm: { ...defaults.cards.sm, radius: 0 },
      controls: { ...defaults.cards.controls, radius: 0 },
      project: { ...defaults.cards.project, radius: 0 },
    },
    menu: { ...defaults.menu, radius: 0, itemRadius: 0, borderWidth: 0 },
    popover: { ...defaults.popover, radius: 0, borderWidth: 0 },
  },
  spacious: {
    ...defaults,
    input: { paddingInline: defaults.input.paddingInline * 2 },
    cards: {
      default: {
        ...defaults.cards.default,
        inset: defaults.cards.default.inset * 2,
        gap: defaults.cards.default.gap * 2,
        headerGap: defaults.cards.default.headerGap * 2,
      },
      sm: {
        ...defaults.cards.sm,
        inset: defaults.cards.sm.inset * 2,
        gap: defaults.cards.sm.gap * 2,
        headerGap: defaults.cards.sm.headerGap * 2,
      },
      controls: {
        ...defaults.cards.controls,
        inset: defaults.cards.controls.inset * 2,
        gap: defaults.cards.controls.gap * 2,
        headerGap: defaults.cards.controls.headerGap * 2,
        contentGap: defaults.cards.controls.contentGap * 2,
      },
      project: {
        ...defaults.cards.project,
        inset: defaults.cards.project.inset * 2,
        gap: defaults.cards.project.gap * 2,
        headerGap: defaults.cards.project.headerGap * 2,
        contentGap: defaults.cards.project.contentGap * 2,
      },
    },
    spacing: {
      ...defaults.spacing,
      rootInset: defaults.spacing.rootInset * 2,
      cardGroupGap: defaults.spacing.cardGroupGap * 2,
      stackGap: defaults.spacing.stackGap * 2,
      toolbarGap: {
        default: defaults.spacing.toolbarGap.default * 2,
        transport: defaults.spacing.toolbarGap.transport * 2,
      },
    },
    menu: {
      ...defaults.menu,
      inset: defaults.menu.inset * 2,
      itemPaddingInline: defaults.menu.itemPaddingInline * 2,
      itemPaddingBlock: defaults.menu.itemPaddingBlock * 2,
      itemGap: defaults.menu.itemGap * 2,
      labelInset: defaults.menu.labelInset * 2,
      selectItemInset: defaults.menu.selectItemInset * 2,
    },
    popover: {
      ...defaults.popover,
      inset: defaults.popover.inset * 2,
      gap: defaults.popover.gap * 2,
      headerGap: defaults.popover.headerGap * 2,
    },
    settings: {
      ...defaults.settings,
      paddingInline: defaults.settings.paddingInline * 2,
      itemGap: defaults.settings.itemGap * 2,
      headerGap: defaults.settings.headerGap * 2,
      headerInset: defaults.settings.headerInset * 2,
      headerTextGap: defaults.settings.headerTextGap * 2,
      navigationGap: defaults.settings.navigationGap * 2,
      navigationInset: defaults.settings.navigationInset * 2,
      contentInset: defaults.settings.contentInset * 2,
    },
    tabs: { itemGap: defaults.tabs.itemGap * 2, contentGap: defaults.tabs.contentGap * 2 },
  },
}
