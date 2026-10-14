import { effectiveDrawMode } from "../../../../../model/interaction-mode"
import { snapBar } from "../../../../../model/grid-geometry"
import { automationAction, automationCursor } from "../../../core/automation"
import { automationBar, automationValue } from "../../../core/automation/geometry"
import { hitAutomation } from "../../../core/automation/hit"
import { synchronizeProjectScene } from "../project-preview"
import {
  drawGesture,
  flatLineGesture,
  marqueeGesture,
  pointGesture,
  segmentGesture,
} from "./gestures"
import { automationKeyDown } from "./commands"
import type { LaneContext, LaneInteraction } from "../types"

export function createAutomationInteractions(context: LaneContext): LaneInteraction {
  return {
    start(pointer) {
      synchronizeProjectScene(context)
      const scene = context.scene.get()
      const hit = hitAutomation(scene, pointer)
      const action = automationAction(hit, effectiveDrawMode(context.getState()), pointer.button)
      if (!hit || !action) return null
      context.actions.selectTracks([hit.row.track.id], "arrangement")
      switch (action) {
        case "draw":
          return drawGesture(context, pointer, hit.row)
        case "point":
          return hit.kind === "point" ? pointGesture(context, pointer, hit.row, hit.point) : null
        case "segment":
          return hit.kind === "segment"
            ? segmentGesture(context, pointer, hit.row, hit.from, hit.to, hit.near)
            : null
        case "flat":
          return hit.kind === "lane" ? flatLineGesture(context, pointer, hit.row, hit.value) : null
        case "marquee":
          return marqueeGesture(context, pointer, hit.row)
        default: {
          const exhaustive: never = action
          return exhaustive
        }
      }
    },
    hover(pointer) {
      return (
        automationCursor(
          hitAutomation(context.scene.get(), pointer),
          effectiveDrawMode(context.getState())
        ) ?? "default"
      )
    },
    doubleClick(pointer) {
      synchronizeProjectScene(context)
      const scene = context.scene.get()
      const hit = hitAutomation(scene, pointer)
      if (hit?.kind === "point") return true
      if (hit?.kind === "segment" && pointer.altKey) {
        context.actions.resetAutomationCurve(hit.row.track.id, hit.row.laneId, hit.from.id)
        return true
      }
      if (hit?.kind === "lane") {
        const bar = snapBar(
          automationBar(scene, pointer.x),
          context.getState().workspace.snap,
          scene.gridPlan.cellBars,
          scene.bars + 1,
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
    contextMenu(pointer) {
      synchronizeProjectScene(context)
      const scene = context.scene.get()
      const hit = hitAutomation(scene, pointer)
      if (!hit) return null
      if (hit.kind === "point")
        return {
          kind: "automation-point",
          trackId: hit.row.track.id,
          laneId: hit.row.laneId,
          pointId: hit.point.id,
        }
      if (hit.kind === "segment")
        return {
          kind: "automation-segment",
          trackId: hit.row.track.id,
          laneId: hit.row.laneId,
          fromPointId: hit.from.id,
          bar: automationBar(scene, pointer.x),
          value: hit.value,
        }
      return {
        kind: "automation-lane",
        trackId: hit.row.track.id,
        laneId: hit.row.laneId,
        bar: automationBar(scene, pointer.x),
        value: hit.onLine ? hit.value : automationValue(hit.row, pointer.y),
      }
    },
    deactivate() {
      const selection = context.scene.get().targetSelection
      if (selection.kind === "automation" || selection.kind === "automation-value")
        context.scene.setTargetSelection({ kind: "none" })
    },
  }
}
