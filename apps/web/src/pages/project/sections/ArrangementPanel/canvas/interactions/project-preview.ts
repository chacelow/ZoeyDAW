import type { LoopRegion, Marker, ProjectEditToken, Track } from "@/pages/project/model/types"
import type { InteractionContext } from "./types"

const edits = new WeakMap<InteractionContext, ProjectEditToken>()

function tokenFor(context: InteractionContext): ProjectEditToken {
  const existing = edits.get(context)
  if (existing) {
    return existing
  }
  const token = context.actions.beginPreview()
  edits.set(context, token)
  return token
}

export function synchronizeProjectScene(context: InteractionContext): void {
  const state = context.getState()
  const scene = context.scene.get()
  context.scene.setMusic({
    bars: scene.bars,
    grid: scene.grid,
    transport: state.document.transport,
    tracks: state.document.tracks,
    markers: state.document.markers,
    loop: state.document.transport.loop,
  })
  context.scene.setProjectPreview(state.session.preview)
  if (state.session.preview?.kind === "tracks") {
    return
  }

  context.scene.setClipDrag(null)
  context.scene.setClipResize(null)
}

export function beginProjectPreview(context: InteractionContext): void {
  finishProjectPreview(context, true)
  edits.set(context, context.actions.beginPreview())
  synchronizeProjectScene(context)
}

export function setTracksPreview(
  context: InteractionContext,
  tracks: readonly Track[] | null
): void {
  context.actions.previewTracks(tokenFor(context), tracks ?? context.getState().document.tracks)
  synchronizeProjectScene(context)
}

export function setMarkersPreview(
  context: InteractionContext,
  markers: readonly Marker[] | null
): void {
  context.actions.previewMarkers(tokenFor(context), markers ?? context.getState().document.markers)
  synchronizeProjectScene(context)
}

export function setLoopPreview(context: InteractionContext, loop: LoopRegion | null): void {
  context.actions.previewLoop(tokenFor(context), loop ?? context.getState().document.transport.loop)
  synchronizeProjectScene(context)
}

export function finishProjectPreview(context: InteractionContext, cancelled: boolean): void {
  const token = edits.get(context)
  edits.delete(context)
  if (token) {
    if (cancelled) {
      context.actions.cancelPreview(token)
    } else {
      context.actions.commitPreview(token)
    }
  }
  synchronizeProjectScene(context)
}
