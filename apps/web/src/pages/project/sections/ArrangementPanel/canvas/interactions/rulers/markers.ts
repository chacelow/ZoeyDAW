import { beginProjectPreview, finishProjectPreview, setMarkersPreview } from "../project-preview"
import { rulerBar, barAt } from "./geometry"
import type { Marker } from "@zoeydaw/project-core/types"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"

export function markerGesture(
  context: InteractionContext,
  marker: Marker,
  pointer: CanvasPointer
): CanvasGesture {
  beginProjectPreview(context)
  const original = context.getState().document.markers.find(item => item.id === marker.id) ?? marker
  const source = context.getState().document.markers
  const grabOffset = barAt(context.scene.get(), pointer.x) - original.bar
  let nextBar = original.bar
  context.scene.setTargetSelection({ kind: "marker", id: marker.id, phase: "selected" })
  return {
    cursor: "grabbing",
    autoScroll: "horizontal",
    move(current) {
      nextBar = rulerBar(
        context.scene.get(),
        current.x - grabOffset * context.scene.get().viewport.pxPerBar,
        context.getState().workspace.snap,
        current.shiftKey
      )
      setMarkersPreview(
        context,
        source.map(item => (item.id === marker.id ? { ...item, bar: nextBar } : item))
      )
    },
    finish(cancelled) {
      finishProjectPreview(context, cancelled)
    },
  }
}
