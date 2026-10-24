import { effectiveDrawMode } from "@zoeydaw/project-core/interaction-mode"
import { snapBar } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import { finishProjectPreview, synchronizeProjectScene } from "../project-preview"
import { automationBar, automationValue } from "./geometry"
import { hitAutomation } from "./hit"
import { pointGesture } from "./points"
import { segmentGesture } from "./segment"
import { drawGesture } from "./drawing"
import { marqueeGesture } from "./selection"
import { flatLineGesture } from "./flat"
import { automationClipboardActions, automationKeyDown } from "./commands"
import type {
  CanvasInteraction,
  CanvasMenuTarget,
  CanvasPointer,
  InteractionContext,
} from "../types"

export function createAutomationInteractions(context: InteractionContext): CanvasInteraction {
  const clipboard = automationClipboardActions(context)
  const resolveHit = (pointer: CanvasPointer) => {
    synchronizeProjectScene(context)
    return hitAutomation(context, pointer)
  }
  return {
    start(pointer) {
      if (pointer.button !== 0) {
        return null
      }
      const hit = resolveHit(pointer)
      if (!hit) {
        return null
      }
      context.actions.selectTracks([hit.row.track.id], "arrangement")
      if (effectiveDrawMode(context.getState())) {
        return drawGesture(context, pointer, hit.row)
      }
      if (hit.kind === "point") {
        return pointGesture(context, pointer, hit.row, hit.point)
      }
      if (hit.kind === "segment") {
        return segmentGesture(context, pointer, hit.row, hit.from, hit.to, hit.near)
      }
      return hit.onLine
        ? flatLineGesture(context, pointer, hit.row, hit.value)
        : marqueeGesture(context, pointer, hit.row)
    },
    hover(pointer) {
      const hit = resolveHit(pointer)
      if (effectiveDrawMode(context.getState()) && hit) {
        return "crosshair"
      }
      return hit?.kind === "point" ? "grab" : hit?.kind === "segment" ? "ns-resize" : undefined
    },
    doubleClick(pointer) {
      const hit = resolveHit(pointer)
      if (hit?.kind === "point") {
        return true
      }
      if (hit?.kind === "segment" && pointer.altKey) {
        context.actions.resetAutomationCurve(hit.row.track.id, hit.row.laneId, hit.from.id)
        return true
      }
      if (hit?.kind === "lane") {
        const state = context.getState()
        const bar = snapBar(
          automationBar(context.scene.get(), pointer.x),
          state.workspace.snap,
          context.scene.get().gridPlan.cellBars,
          context.scene.get().bars + 1,
          pointer.altKey || pointer.metaKey
        )
        context.actions.setAutomationPoint(hit.row.track.id, hit.row.laneId, {
          bar,
          value: automationValue(hit.row, pointer.y),
        })
        return true
      }
      return false
    },
    keyDown: event => automationKeyDown(context, event),
    ...clipboard,
    contextMenu(pointer): CanvasMenuTarget | null {
      const hit = resolveHit(pointer)
      if (!hit) {
        return null
      }
      if (hit.kind === "point") {
        return {
          kind: "automation-point",
          trackId: hit.row.track.id,
          placement: hit.row.placement,
          laneId: hit.row.laneId,
          pointId: hit.point.id,
        }
      }
      if (hit.kind === "segment") {
        return {
          kind: "automation-segment",
          trackId: hit.row.track.id,
          laneId: hit.row.laneId,
          fromPointId: hit.from.id,
          bar: automationBar(context.scene.get(), pointer.x),
          value: hit.value,
        }
      }
      return {
        kind: "automation-lane",
        trackId: hit.row.track.id,
        laneId: hit.row.laneId,
        bar: automationBar(context.scene.get(), pointer.x),
        value: hit.onLine ? hit.value : automationValue(hit.row, pointer.y),
      }
    },
    deactivate() {
      const selection = context.scene.get().targetSelection
      if (selection.kind === "automation" || selection.kind === "automation-value") {
        context.scene.setTargetSelection({ kind: "none" })
      }
      if (context.getState().session.preview?.kind === "tracks") {
        finishProjectPreview(context, true)
      }
    },
  }
}
