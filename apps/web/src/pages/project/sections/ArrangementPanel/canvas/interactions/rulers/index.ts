import { positionToBar } from "@/pages/project/model/types"
import { MARKER_RULER_HEIGHT } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { finishProjectPreview } from "../project-preview"
import { rulerHit, rulerBar } from "./geometry"
import { markerGesture } from "./markers"
import { loopFromSelection, loopGesture } from "./loop"
import type { CanvasInteraction, CanvasPointer, InteractionContext } from "../types"

export function createRulerInteractions(context: InteractionContext): CanvasInteraction {
  const { scene, actions } = context
  function owned() {
    const { kind } = scene.get().targetSelection
    return kind === "marker" || kind === "loop"
  }
  function deleteSelected(): boolean {
    const selection = scene.get().targetSelection
    if (selection.kind !== "marker") {
      return false
    }
    actions.deleteMarker(selection.id)
    scene.setTargetSelection({ kind: "none" })
    return true
  }
  return {
    start(pointer) {
      if (pointer.button !== 0) {
        return null
      }
      const hit = rulerHit(scene.get(), pointer)
      if (!hit) {
        return null
      }
      if (hit.kind === "marker") {
        return markerGesture(context, hit.marker, pointer)
      }
      if (hit.kind === "loop") {
        return loopGesture(context, hit.edge, pointer)
      }
      const initial = context.getState()
      const origin = positionToBar(initial.session.position, initial.document.transport.numerator)
      const originalInsertion = initial.session.insertionPoint
      actions.seekBar(rulerBar(scene.get(), pointer.x, initial.workspace.snap, pointer.shiftKey))
      return {
        cursor: "default",
        autoScroll: "horizontal",
        move(current) {
          actions.seekBar(
            rulerBar(scene.get(), current.x, context.getState().workspace.snap, current.shiftKey)
          )
        },
        finish(cancelled) {
          if (cancelled) {
            actions.restoreSeek(origin, originalInsertion)
          }
        },
      }
    },
    hover(pointer) {
      const hit = rulerHit(scene.get(), pointer)
      return hit?.kind === "marker" || (hit?.kind === "loop" && hit.edge === "body")
        ? "grab"
        : hit?.kind === "loop"
          ? "ew-resize"
          : hit
            ? "default"
            : undefined
    },
    doubleClick(pointer) {
      const hit = rulerHit(scene.get(), pointer)
      if (!hit) {
        return false
      }
      if (hit.kind === "marker") {
        actions.seekBar(hit.marker.bar)
        if (!context.getState().session.playing) {
          actions.togglePlay()
        }
        scene.setTargetSelection({ kind: "marker", id: hit.marker.id, phase: "selected" })
      } else if (hit.kind === "loop") {
        actions.setLoop({ enabled: !scene.get().loop.enabled })
        scene.setTargetSelection({ kind: "loop" })
      } else if (pointer.y < MARKER_RULER_HEIGHT) {
        const id = actions.addMarker(
          rulerBar(scene.get(), pointer.x, context.getState().workspace.snap, pointer.shiftKey)
        )
        if (id) {
          scene.setTargetSelection({ kind: "marker", id, phase: "selected" })
        }
      } else {
        return false
      }
      return true
    },
    keyDown(event) {
      if (event.metaKey || event.ctrlKey) {
        if (event.code === "KeyL") {
          if (!loopFromSelection(context)) {
            actions.setLoop({ enabled: !scene.get().loop.enabled })
          }
          event.preventDefault()
          return true
        }
        if (event.code === "KeyR") {
          const selection = scene.get().targetSelection
          if (selection.kind !== "marker") {
            return false
          }
          scene.setTargetSelection({ ...selection, phase: "renaming" })
          event.preventDefault()
          return true
        }
        return false
      }
      if (event.code === "Delete" || event.code === "Backspace") {
        if (!deleteSelected()) {
          return false
        }
      } else if (event.code === "F2" || event.code === "Enter") {
        const selection = scene.get().targetSelection
        if (selection.kind !== "marker") {
          return false
        }
        scene.setTargetSelection({ ...selection, phase: "renaming" })
      } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        const target = scene.get().targetSelection
        if (target.kind === "loop") {
          const { document, workspace } = context.getState()
          const { loop } = document.transport
          const step = workspace.snap ? scene.get().gridPlan.cellBars : 1 / 16
          const delta = event.code === "ArrowRight" ? step : -step
          const length = loop.endBar - loop.startBar
          const startBar = Math.max(
            1,
            Math.min(scene.get().bars + 1 - length, loop.startBar + delta)
          )
          if (startBar !== loop.startBar) {
            actions.setLoop({ startBar, endBar: startBar + length })
          }
        } else if (target.kind === "marker") {
          const state = context.getState()
          const marker = state.document.markers.find(item => item.id === target.id)
          if (!marker) {
            return false
          }
          const step = state.workspace.snap ? scene.get().gridPlan.cellBars : 1 / 16
          const bar = Math.max(
            1,
            Math.min(
              scene.get().bars + 1,
              marker.bar + (event.code === "ArrowRight" ? step : -step)
            )
          )
          if (bar !== marker.bar) {
            actions.updateMarker(marker.id, { bar })
          }
        } else {
          return false
        }
      } else if (event.code === "Escape") {
        if (!owned()) {
          return false
        }
        scene.setTargetSelection({ kind: "none" })
      } else {
        return false
      }
      event.preventDefault()
      return true
    },
    contextMenu(pointer: CanvasPointer) {
      const hit = rulerHit(scene.get(), pointer)
      if (!hit) {
        return null
      }
      if (hit.kind === "marker") {
        scene.setTargetSelection({ kind: "marker", id: hit.marker.id, phase: "selected" })
        return { kind: "marker", markerId: hit.marker.id }
      }
      if (hit.kind === "loop") {
        scene.setTargetSelection({ kind: "loop" })
        return { kind: "loop" }
      }
      return {
        kind: "ruler",
        bar: rulerBar(scene.get(), pointer.x, context.getState().workspace.snap, pointer.shiftKey),
      }
    },
    deactivate() {
      const target = scene.get().targetSelection
      if (target.kind === "loop" || (target.kind === "marker" && target.phase === "selected")) {
        scene.setTargetSelection({ kind: "none" })
      }
      const { preview } = context.getState().session
      if (preview?.kind === "markers" || preview?.kind === "loop") {
        finishProjectPreview(context, true)
      }
    },
  }
}
