import { uniqueId } from "@/pages/project/model/reducers"
import { clipboardMemory } from "@/pages/project/adapters/clipboard-memory"
import type { InteractionContext } from "../types"
import { sortedPoints } from "./preview"
import { AUTOMATION_MIME, parseAutomationClipboard } from "./clipboard"

export function automationKeyDown(context: InteractionContext, event: KeyboardEvent): boolean {
  const selection = context.scene.get().targetSelection
  if (selection.kind !== "automation") return false
  const command = (event.metaKey || event.ctrlKey) && !event.altKey
  const key = event.key.toLowerCase()
  if (command && key === "a") {
    const points =
      context
        .getState()
        .document.tracks.find(track => track.id === selection.trackId)
        ?.automation.find(lane => lane.id === selection.laneId)?.points ?? []
    context.scene.setTargetSelection({ ...selection, pointIds: points.map(point => point.id) })
    return true
  }
  if (command && key === "d" && selection.pointIds.length) {
    const lane = context
      .getState()
      .document.tracks.find(track => track.id === selection.trackId)
      ?.automation.find(item => item.id === selection.laneId)
    const chosen = lane?.points.filter(point => selection.pointIds.includes(point.id)) ?? []
    if (!lane || !chosen.length) return true
    const width = Math.max(
      context.scene.get().gridPlan.cellBars,
      chosen[chosen.length - 1].bar - chosen[0].bar + context.scene.get().gridPlan.cellBars
    )
    const copies = chosen.map(point => ({
      ...point,
      id: uniqueId("point"),
      bar: point.bar + width,
    }))
    if (copies.some(point => point.bar > context.scene.get().bars + 1)) return true
    context.actions.replaceAutomationPoints(
      selection.trackId,
      selection.laneId,
      sortedPoints([
        ...lane.points.filter(
          point => !copies.some(copy => Math.abs(point.bar - copy.bar) < 0.000001)
        ),
        ...copies,
      ])
    )
    context.scene.setTargetSelection({ ...selection, pointIds: copies.map(point => point.id) })
    return true
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    context.actions.deleteAutomationPoints(selection.trackId, selection.laneId, selection.pointIds)
    context.scene.setTargetSelection({ kind: "none" })
    return true
  }
  if (event.key === "Escape") {
    context.scene.setTargetSelection({ kind: "none" })
    return true
  }
  return false
}

export function automationClipboardActions(context: InteractionContext) {
  function copy(event: ClipboardEvent): boolean {
    const selection = context.scene.get().targetSelection
    if (selection.kind !== "automation") return false
    const lane = context
      .getState()
      .document.tracks.find(track => track.id === selection.trackId)
      ?.automation.find(item => item.id === selection.laneId)
    const points = lane?.points.filter(point => selection.pointIds.includes(point.id)) ?? []
    if (!lane || !points.length) return false
    const data = JSON.stringify({
      kind: "automation",
      version: 1,
      parameter: lane.parameter,
      points,
    })
    clipboardMemory.write(data)
    event.clipboardData?.setData(AUTOMATION_MIME, data)
    event.clipboardData?.setData("text/plain", data)
    return true
  }
  return {
    copy,
    cut(event: ClipboardEvent): boolean {
      const selection = context.scene.get().targetSelection
      if (selection.kind !== "automation" || !copy(event)) return false
      context.actions.deleteAutomationPoints(
        selection.trackId,
        selection.laneId,
        selection.pointIds
      )
      context.scene.setTargetSelection({ kind: "none" })
      return true
    },
    paste(event: ClipboardEvent): boolean {
      const selection = context.scene.get().targetSelection
      if (selection.kind !== "automation") return false
      const native =
        event.clipboardData?.getData(AUTOMATION_MIME) || event.clipboardData?.getData("text/plain")
      if (event.clipboardData && event.clipboardData.types.length)
        clipboardMemory.write(native ?? "")
      const raw = event.clipboardData?.types.length ? (native ?? "") : clipboardMemory.read()
      const payload = parseAutomationClipboard(raw)
      if (!payload) return raw.includes('"kind":"automation"')
      const lane = context
        .getState()
        .document.tracks.find(track => track.id === selection.trackId)
        ?.automation.find(item => item.id === selection.laneId)
      if (!lane || lane.parameter !== payload.parameter) return true
      const anchor = lane.points.find(point => selection.pointIds.includes(point.id))?.bar ?? 1
      const delta = anchor - payload.points[0].bar
      const points = payload.points.map(point => ({
        ...point,
        id: uniqueId("point"),
        bar: point.bar + delta,
      }))
      if (points.some(point => point.bar < 1 || point.bar > context.scene.get().bars + 1))
        return true
      const merged = sortedPoints([
        ...lane.points.filter(
          point => !points.some(next => Math.abs(point.bar - next.bar) < 0.000001)
        ),
        ...points,
      ])
      context.actions.replaceAutomationPoints(selection.trackId, selection.laneId, merged)
      context.scene.setTargetSelection({
        kind: "automation",
        trackId: selection.trackId,
        laneId: selection.laneId,
        pointIds: points.map(point => point.id),
      })
      return true
    },
  }
}
