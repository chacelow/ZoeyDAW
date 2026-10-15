import type { AutomationPoint } from "@/project/model/types"
import type { AutomationRow } from "@/project/sections/arrangement/core/automation/geometry"
import { beginTracksPreview } from "../project-preview"
import type { LaneContext } from "../types"

export function beginAutomationPreview(context: LaneContext, row: AutomationRow) {
  const preview = beginTracksPreview(context)
  const source = context.getState().document.tracks
  return {
    update(points: AutomationPoint[]) {
      preview.update(
        source.map(track => {
          if (track.id !== row.track.id) return track
          const existing = track.automation.some(lane => lane.id === row.laneId)
          return {
            ...track,
            automation: existing
              ? track.automation.map(lane => (lane.id === row.laneId ? { ...lane, points } : lane))
              : [...track.automation, { id: row.laneId, parameter: row.parameter, points }],
          }
        })
      )
    },
    finish: preview.finish,
  }
}
