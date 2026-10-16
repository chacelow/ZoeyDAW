import { uniqueId } from "@/project/model/reducers"
import type { AutomationPoint } from "@/project/model/types"
import { automationBar } from "@/project/sections/arrangement/core/automation/geometry"
import type { AutomationRow } from "@/project/sections/arrangement/core/automation/geometry"
import {
  deletePointOnRelease,
  movePoints,
  selectedPointIds,
} from "@/project/sections/arrangement/core/automation/points"
import {
  insertSegmentPoint,
  moveSegment,
  shouldInsertSegmentPoint,
} from "@/project/sections/arrangement/core/automation/segment"
import { paintAutomation } from "@/project/sections/arrangement/core/automation/drawing"
import type { DrawingState } from "@/project/sections/arrangement/core/automation/drawing"
import { marqueePointIds } from "@/project/sections/arrangement/core/automation/selection"
import {
  flatLinePoint,
  shouldInsertFlatPoint,
} from "@/project/sections/arrangement/core/automation/flat"
import { beginAutomationPreview } from "./preview"
import type { LaneContext, LaneGesture, LanePointer } from "../types"

export function pointGesture(
  context: LaneContext,
  pointer: LanePointer,
  row: AutomationRow,
  point: AutomationPoint
): LaneGesture {
  const preview = beginAutomationPreview(context, row)
  const source = row.lane?.points ?? []
  const selection = context.scene.get().targetSelection
  const existing =
    selection.kind === "automation" &&
    selection.trackId === row.track.id &&
    selection.laneId === row.laneId
      ? selection.pointIds
      : []
  const ids = selectedPointIds(existing, point.id, pointer.shiftKey)
  context.scene.setTargetSelection(
    ids.length
      ? { kind: "automation", trackId: row.track.id, laneId: row.laneId, pointIds: ids }
      : { kind: "none" }
  )
  const originBar = automationBar(context.scene.get(), pointer.x)
  let moved = false
  return {
    cursor: "grabbing",
    autoScroll: "horizontal",
    move(current) {
      if (!ids.length) return
      moved = true
      const scene = context.scene.get()
      preview.update(
        movePoints({
          source,
          ids,
          rawDelta: automationBar(scene, current.x) - originBar,
          valueDelta: ((pointer.y - current.y) / row.valueHeight) * (current.shiftKey ? 0.1 : 1),
          snap: context.getState().workspace.snap,
          cellBars: scene.gridPlan.cellBars,
          endBar: scene.bars + 1,
          bypass: current.altKey || current.metaKey,
        })
      )
    },
    finish(cancelled) {
      preview.finish(cancelled || !moved)
      if (deletePointOnRelease(cancelled, moved, pointer.shiftKey, ids)) {
        context.actions.deleteAutomationPoint(row.track.id, row.laneId, point.id)
        context.scene.setTargetSelection({ kind: "none" })
      }
    },
  }
}

export function segmentGesture(
  context: LaneContext,
  pointer: LanePointer,
  row: AutomationRow,
  from: AutomationPoint,
  to: AutomationPoint,
  near: boolean
): LaneGesture {
  const preview = beginAutomationPreview(context, row)
  const source = row.lane?.points ?? []
  let changed = false
  return {
    cursor: pointer.altKey ? "ns-resize" : "grabbing",
    autoScroll: false,
    move(current) {
      changed = true
      const delta = ((pointer.y - current.y) / row.valueHeight) * (current.shiftKey ? 0.1 : 1)
      preview.update(moveSegment(source, from.id, to.id, delta, pointer.altKey))
    },
    finish(cancelled) {
      preview.finish(cancelled || !changed)
      if (!shouldInsertSegmentPoint(cancelled, changed, pointer.altKey, near)) return
      const scene = context.scene.get()
      context.actions.setAutomationPoint(
        row.track.id,
        row.laneId,
        insertSegmentPoint(
          from,
          to,
          automationBar(scene, pointer.x),
          context.getState().workspace.snap,
          scene.gridPlan.cellBars,
          scene.bars + 1,
          pointer.metaKey
        )
      )
    },
  }
}

export function drawGesture(
  context: LaneContext,
  pointer: LanePointer,
  row: AutomationRow
): LaneGesture {
  const preview = beginAutomationPreview(context, row)
  const original = row.lane?.points ?? []
  const grid = context.scene.get().gridPlan.cellBars
  const freehand = pointer.altKey || pointer.metaKey
  const idPrefix = uniqueId("point")
  let state: DrawingState = { painted: [], swept: [], last: pointer, nextId: 0 }
  const paint = (current: LanePointer) => {
    const result = paintAutomation({
      original,
      state,
      current,
      scene: context.scene.get(),
      policy: context.policy.automation,
      row,
      grid,
      freehand,
      idPrefix,
    })
    state = result.state
    preview.update(result.points)
  }
  paint(pointer)
  return {
    cursor: "crosshair",
    autoScroll: "horizontal",
    move: paint,
    finish: preview.finish,
  }
}

export function marqueeGesture(
  context: LaneContext,
  pointer: LanePointer,
  row: AutomationRow
): LaneGesture {
  const previous = context.scene.get().targetSelection
  const originBar = automationBar(context.scene.get(), pointer.x)
  let moved = false
  return {
    cursor: "default",
    autoScroll: "horizontal",
    move(current) {
      moved = true
      context.scene.setTargetSelection({
        kind: "automation",
        trackId: row.track.id,
        laneId: row.laneId,
        pointIds: marqueePointIds(
          row,
          originBar,
          automationBar(context.scene.get(), current.x),
          pointer.y,
          current.y
        ),
      })
    },
    finish(cancelled) {
      if (cancelled) context.scene.setTargetSelection(previous)
      else if (!moved)
        context.scene.setTargetSelection({
          kind: "automation",
          trackId: row.track.id,
          laneId: row.laneId,
          pointIds: [],
        })
    },
  }
}

export function flatLineGesture(
  context: LaneContext,
  pointer: LanePointer,
  row: AutomationRow,
  value: number
): LaneGesture {
  let moved = false
  return {
    cursor: "default",
    autoScroll: false,
    move() {
      moved = true
    },
    finish(cancelled) {
      if (!shouldInsertFlatPoint(cancelled, moved)) return
      const scene = context.scene.get()
      context.actions.setAutomationPoint(
        row.track.id,
        row.laneId,
        flatLinePoint(
          automationBar(scene, pointer.x),
          value,
          context.getState().workspace.snap,
          scene.gridPlan.cellBars,
          scene.bars + 1,
          pointer.altKey || pointer.metaKey
        )
      )
    },
  }
}
