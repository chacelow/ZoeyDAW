import { setTracksPreview } from "../project-preview"
import type { AutomationPoint } from "@/pages/project/model/types"
import type { InteractionContext } from "../types"

export function previewAutomation(
  context: InteractionContext,
  trackId: string,
  laneId: string,
  points: AutomationPoint[]
) {
  const scene = context.scene.get()
  const tracks = context.getState().document.tracks.map(track => {
    if (track.id !== trackId) {
      return track
    }
    const existing = track.automation.find(lane => lane.id === laneId)
    const parameter = existing?.parameter ?? scene.automationParameters[trackId] ?? "volume"
    const automation = existing
      ? track.automation.map(lane => (lane.id === laneId ? { ...lane, points } : lane))
      : [...track.automation, { id: laneId, parameter, points }]
    return { ...track, automation }
  })
  setTracksPreview(context, tracks)
}

export function sortedPoints(points: AutomationPoint[]): AutomationPoint[] {
  return points
    .sort((a, b) => a.bar - b.bar || a.id.localeCompare(b.id))
    .filter((point, index, array) => index === 0 || point.bar - array[index - 1].bar >= 0.000001)
}
