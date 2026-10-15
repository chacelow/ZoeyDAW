import type { ProjectEditToken, Track } from "@/project/model/types"
import type { LaneContext } from "./types"

export function beginTracksPreview(context: LaneContext) {
  const epoch = context.getState().session.editEpoch
  let token: ProjectEditToken | null = context.actions.beginPreview()
  return {
    update(tracks: readonly Track[]) {
      if (!token || context.getState().session.editEpoch !== epoch) return
      context.actions.previewTracks(token, tracks)
    },
    finish(cancelled: boolean) {
      const current = token
      token = null
      if (!current) return
      if (context.getState().session.editEpoch === epoch) {
        if (cancelled) context.actions.cancelPreview(current)
        else context.actions.commitPreview(current)
      }
    },
  }
}
