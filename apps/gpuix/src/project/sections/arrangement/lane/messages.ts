import type { GridDensity } from "@/project/model/grid"

export type LaneMessageKey =
  | "arrangement.timelineEditor"
  | "arrangement.rename"
  | "arrangement.editAutomationValue"
  | "arrangement.copy"
  | "arrangement.cut"
  | "arrangement.paste"
  | "arrangement.duplicateClip"
  | "arrangement.splitAtPlayhead"
  | "arrangement.clipColor"
  | "arrangement.deleteClip"
  | "arrangement.createAudioClip"
  | "arrangement.createMidiClip"
  | "arrangement.createPatternClip"
  | "arrangement.resetAutomationCurve"
  | "arrangement.deleteAutomationPoint"
  | "arrangement.addAutomationPoint"
  | "arrangement.adaptiveGrid"
  | "arrangement.fixedGrid"
  | "arrangement.gridBar"
  | "arrangement.gridBars"
  | "detail.openClip"
  | `arrangement.gridDensity.${GridDensity}`

export type LaneTranslate = (key: LaneMessageKey) => string

export type LaneLabels = Readonly<Record<LaneMessageKey, string>>
