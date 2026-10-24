import type { Track } from "@zoeydaw/project-core/types"
import { projectActions } from "../adapters"

export const PREVIEW_SCENARIOS = [
  "expanded",
  "folded",
  "nested",
  "multiple",
  "muted",
  "solo",
  "armed",
  "routing",
] as const

export type PreviewScenario = (typeof PREVIEW_SCENARIOS)[number]

export function applyPreviewScenario(
  value: PreviewScenario,
  tracks: readonly Track[],
  selected: Track | undefined
) {
  const token = projectActions.beginEdit()
  for (const track of tracks)
    projectActions.updateTrack(track.id, { mute: false, solo: false, armed: false })
  if (value === "expanded" || value === "folded" || value === "nested" || value === "multiple") {
    for (const track of tracks)
      projectActions.updateTrack(track.id, {
        collapsed:
          value === "folded" ||
          (value === "nested" && track.id === "drums") ||
          (value === "multiple" && track.kind !== "group"),
      })
    projectActions.setViewport({ scrollY: 0 })
  } else if (value === "armed") {
    for (const track of tracks)
      if (track.kind === "audio" || track.kind === "midi")
        projectActions.updateTrack(track.id, { armed: true })
  } else if (selected) {
    projectActions.updateTrack(
      selected.id,
      value === "muted"
        ? { mute: true }
        : value === "solo"
          ? { solo: true }
          : { output: selected.kind === "main" ? "external" : "main" }
    )
  }
  projectActions.endEdit(token)
}
