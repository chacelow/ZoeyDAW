import type { ProjectEditToken, Track } from "@/project/model/types"
import type { LaneContext } from "./types"

export function synchronizeProjectScene(context: LaneContext): void {
  const state = context.getState()
  const scene = context.scene.get()
  context.scene.setMusic({
    bars: scene.bars,
    grid: state.workspace.grid,
    transport: state.document.transport,
    tracks: state.document.tracks,
    markers: state.document.markers,
    loop: state.document.transport.loop,
  })
  context.scene.setProjectPreview(state.session.preview)
  context.scene.setPlayback({
    playing: state.session.playing,
    insertionPoint: state.session.insertionPoint,
  })
  if (state.session.preview?.kind !== "tracks") {
    context.scene.setClipDrag(null)
    context.scene.setClipResize(null)
  }
}

export function beginTracksPreview(context: LaneContext) {
  const epoch = context.getState().session.editEpoch
  let token: ProjectEditToken | null = context.actions.beginPreview()
  synchronizeProjectScene(context)
  return {
    update(tracks: readonly Track[]) {
      if (!token || context.getState().session.editEpoch !== epoch) return
      context.actions.previewTracks(token, tracks)
      synchronizeProjectScene(context)
    },
    finish(cancelled: boolean) {
      const current = token
      token = null
      if (!current) return
      if (context.getState().session.editEpoch === epoch) {
        if (cancelled) context.actions.cancelPreview(current)
        else context.actions.commitPreview(current)
      }
      synchronizeProjectScene(context)
    },
  }
}
