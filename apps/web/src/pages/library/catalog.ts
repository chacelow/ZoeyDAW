import { stateProfiles } from "./state-profiles"
import type { StateProfile } from "./state-profiles"

export type GalleryGroup = "controls" | "navigation" | "feedback" | "daw"
export type GalleryState =
  | "idle"
  | "hover"
  | "focus"
  | "pressed"
  | "active"
  | "disabled"
  | "readonly"
  | "preedit"
  | "editing"
  | "valid"
  | "invalid"
  | "dragging"
  | "dropTarget"
  | "commit"
  | "cancel"
  | "loading"
  | "empty"
  | "error"
  | "retry"
export type StateCoverage = { readonly kind: "supported" | "na"; readonly note: string }
export type GalleryProfile = keyof typeof stateProfiles
export const galleryStates: readonly GalleryState[] = [
  "idle",
  "hover",
  "focus",
  "pressed",
  "active",
  "disabled",
  "readonly",
  "preedit",
  "editing",
  "valid",
  "invalid",
  "dragging",
  "dropTarget",
  "commit",
  "cancel",
  "loading",
  "empty",
  "error",
  "retry",
]
export type PreviewKind =
  "tracks" | "groups" | "clips" | "audio" | "piano-roll" | "automation" | "devices" | "track-editor"
export type GalleryFamilyId =
  | PreviewKind
  | "buttons"
  | "numbers"
  | "bars"
  | "bipolar"
  | "toggles"
  | "pan"
  | "knobs"
  | "meters"
  | "faders"
  | "inputs"
  | "radio"
  | "toggle-group"
  | "toggle"
  | "tabs"
  | "dropdowns"
  | "popup"
  | "popover"
  | "context"
  | "command"
  | "list"
  | "feedback"
  | "warnings"
  | "mapping"
  | "dragPreview"
  | "projects"
  | "toolbars"
  | "layout"
type DemoSource =
  | "controls"
  | "forms"
  | "menus"
  | "interaction"
  | "feedback"
  | "composition"
  | "pan"
  | "faders"
  | "command"
  | "layout"
  | "knobs"
  | "meters"
export interface GalleryFamily {
  readonly id: GalleryFamilyId
  readonly group: GalleryGroup
  readonly source: DemoSource | "preview"
  readonly sections: readonly string[]
  readonly variants: readonly string[]
  readonly profile: GalleryProfile
  readonly preview?: PreviewKind
  readonly transient?: boolean
}
export const galleryCatalog: readonly GalleryFamily[] = [
  {
    id: "buttons",
    group: "controls",
    source: "forms",
    sections: ["buttons"],
    variants: ["buttonStyles", "buttonSizes", "buttonIcons", "buttonColors"],
    profile: "button",
  },
  {
    id: "numbers",
    group: "controls",
    source: "controls",
    sections: ["numbers", "sizing"],
    variants: ["numberDecimal", "numberPosition", "numberSizing", "controlStates"],
    profile: "numeric",
  },
  {
    id: "bars",
    group: "controls",
    source: "controls",
    sections: ["bars"],
    variants: ["barVolume", "barSend", "controlStates"],
    profile: "numeric",
  },
  {
    id: "bipolar",
    group: "controls",
    source: "controls",
    sections: ["bipolar"],
    variants: ["bipolarPan", "bipolarGain", "controlStates"],
    profile: "numeric",
  },
  {
    id: "toggles",
    group: "controls",
    source: "controls",
    sections: ["toggles"],
    variants: ["toggleLink", "toggleMute", "toggleSolo", "toggleSizes"],
    profile: "toggle",
  },
  {
    id: "pan",
    group: "controls",
    source: "pan",
    sections: [],
    variants: ["panCenter", "panStereo", "panDisabled"],
    profile: "pan",
  },
  {
    id: "knobs",
    group: "controls",
    source: "knobs",
    sections: [],
    variants: ["knobUnipolar", "knobBipolar", "controlStates"],
    profile: "knob",
    transient: true,
  },
  {
    id: "meters",
    group: "controls",
    source: "meters",
    sections: [],
    variants: ["meterChannels", "meterOrientation", "meterLevels", "meterBallistics"],
    profile: "meter",
    transient: true,
  },
  {
    id: "faders",
    group: "controls",
    source: "faders",
    sections: [],
    variants: ["faderHorizontal", "faderVertical", "faderDisabled"],
    profile: "fader",
  },
  {
    id: "inputs",
    group: "controls",
    source: "forms",
    sections: ["inputs"],
    variants: ["inputStates", "inputValidation"],
    profile: "input",
  },
  {
    id: "radio",
    group: "navigation",
    source: "forms",
    sections: ["radio"],
    variants: ["choiceRadio", "choiceDisabled"],
    profile: "choice",
  },
  {
    id: "toggle-group",
    group: "navigation",
    source: "forms",
    sections: ["toggle-group"],
    variants: ["choiceGroup", "choiceDisabled"],
    profile: "choice",
  },
  {
    id: "toggle",
    group: "navigation",
    source: "forms",
    sections: ["toggle"],
    variants: ["choiceToggle", "choiceDisabled"],
    profile: "choice",
  },
  {
    id: "tabs",
    group: "navigation",
    source: "forms",
    sections: ["tabs"],
    variants: ["tabsContent", "tabsSettings"],
    profile: "tabs",
  },
  {
    id: "dropdowns",
    group: "navigation",
    source: "menus",
    sections: ["dropdowns", "alignment"],
    variants: ["dropdownGrouped", "dropdownPlacement"],
    profile: "menu",
  },
  {
    id: "popup",
    group: "navigation",
    source: "menus",
    sections: ["popup"],
    variants: ["popupControls"],
    profile: "menu",
  },
  {
    id: "popover",
    group: "navigation",
    source: "menus",
    sections: ["popover"],
    variants: ["popoverAction"],
    profile: "menu",
  },
  {
    id: "context",
    group: "navigation",
    source: "menus",
    sections: ["context"],
    variants: ["contextItems", "contextSubmenu"],
    profile: "context",
  },
  {
    id: "command",
    group: "navigation",
    source: "command",
    sections: [],
    variants: ["commandSearch", "commandEmpty"],
    profile: "command",
  },
  {
    id: "list",
    group: "navigation",
    source: "interaction",
    sections: ["list"],
    variants: ["listSelection", "listScroll"],
    profile: "list",
  },
  {
    id: "feedback",
    group: "feedback",
    source: "feedback",
    sections: ["progress", "resourceStates", "toast"],
    variants: ["feedbackProgress", "feedbackResource", "feedbackToast"],
    profile: "feedback",
    transient: true,
  },
  {
    id: "warnings",
    group: "feedback",
    source: "interaction",
    sections: ["warnings"],
    variants: ["warningSeverity", "warningDismiss"],
    profile: "warning",
  },
  {
    id: "mapping",
    group: "feedback",
    source: "interaction",
    sections: ["mapping"],
    variants: ["mappingState", "mappingTarget"],
    profile: "mapping",
  },
  {
    id: "dragPreview",
    group: "feedback",
    source: "feedback",
    sections: ["dragPreview"],
    variants: ["dragSource", "dragCancel"],
    profile: "drag",
    transient: true,
  },
  {
    id: "projects",
    group: "navigation",
    source: "composition",
    sections: ["projects"],
    variants: ["cardSelection", "cardFavorite", "cardBadge"],
    profile: "card",
  },
  {
    id: "toolbars",
    group: "navigation",
    source: "composition",
    sections: ["toolbars"],
    variants: ["toolbarDefault", "toolbarTransport"],
    profile: "toolbar",
  },
  {
    id: "layout",
    group: "navigation",
    source: "layout",
    sections: [],
    variants: ["layoutSplit", "layoutSeparator"],
    profile: "layout",
  },
  ...(
    [
      "tracks",
      "groups",
      "clips",
      "audio",
      "piano-roll",
      "automation",
      "devices",
      "track-editor",
    ] satisfies PreviewKind[]
  ).map((preview): GalleryFamily => ({
    id: preview,
    group: "daw",
    source: "preview",
    sections: [],
    variants: [`daw-${preview}`],
    profile: preview,
    preview,
    transient: true,
  })),
]
export const galleryGroups: readonly GalleryGroup[] = ["controls", "navigation", "feedback", "daw"]
export function coverageFor(family: GalleryFamily, state: GalleryState): StateCoverage {
  const profile: StateProfile = stateProfiles[family.profile]
  const note = profile[state]
  if (!note && family.profile === "meter") return { kind: "na", note: "meterReadonly" }
  if (!note && family.preview && ["loading", "error", "retry"].includes(state))
    return { kind: "na", note: "dawNaResource" }
  if (!note && family.preview && ["valid", "invalid"].includes(state))
    return { kind: "na", note: "dawNaValidation" }
  if (family.profile === "automation" && state === "dropTarget")
    return { kind: "na", note: "automationNaDrop" }
  return note ? { kind: "supported", note } : { kind: "na", note: `na-${state}` }
}
