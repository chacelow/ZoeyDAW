import { clipboardMemory } from "../../../../adapters/clipboard-memory"
import { parseClipClipboard } from "../../../../model/clip-clipboard"
import { positionToBar } from "../../../../model/types"
import { uniqueId } from "../../../../model/reducers"
import { parseAutomationClipboard } from "../../core/automation/clipboard"
import { sortedPoints } from "../../core/automation/points"
import type { LaneContext, NativeClipboard } from "./types"

export function createLaneClipboard(
  context: LaneContext,
  clipboard: NativeClipboard,
  getTarget: () => { trackId: string; bar: number } | null
) {
  return (command: "copy" | "cut" | "paste", surface?: "clip" | "automation"): boolean => {
    const state = context.getState()
    const selection = context.scene.get().targetSelection
    if (surface === "automation" || (surface === undefined && state.workspace.automationMode)) {
      if (selection.kind !== "automation") return false
      const lane = state.document.tracks
        .find(track => track.id === selection.trackId)
        ?.automation.find(item => item.id === selection.laneId)
      if (!lane) return false
      if (command !== "paste") {
        const points = lane.points.filter(point => selection.pointIds.includes(point.id))
        if (!points.length) return false
        const data = JSON.stringify({
          kind: "automation",
          version: 1,
          parameter: lane.parameter,
          points,
        })
        clipboard.writeText(data)
        clipboardMemory.write(data)
        if (command === "cut") {
          context.actions.deleteAutomationPoints(
            selection.trackId,
            selection.laneId,
            selection.pointIds
          )
          context.scene.setTargetSelection({ kind: "none" })
        }
        return true
      }
      const raw = clipboard.readText() ?? ""
      clipboardMemory.write(raw)
      const payload = parseAutomationClipboard(raw)
      if (!payload) return false
      if (payload.parameter !== lane.parameter) return true
      const first = payload.points[0]
      if (!first) return true
      const anchor = lane.points.find(point => selection.pointIds.includes(point.id))?.bar ?? 1
      const points = payload.points.map(point => ({
        ...point,
        id: uniqueId("point"),
        bar: point.bar + anchor - first.bar,
      }))
      if (points.some(point => point.bar < 1 || point.bar > context.scene.get().bars + 1))
        return true
      context.actions.replaceAutomationPoints(
        selection.trackId,
        selection.laneId,
        sortedPoints([
          ...lane.points.filter(point =>
            points.every(next => Math.abs(point.bar - next.bar) >= 0.000001)
          ),
          ...points,
        ])
      )
      context.scene.setTargetSelection({ ...selection, pointIds: points.map(point => point.id) })
      return true
    }
    const ids = state.session.selectedClipIds
    if (command !== "paste") {
      const copied = context.actions.copyClips(ids, state.session.timeSelection ?? undefined)
      if (!copied) return false
      clipboard.writeText(JSON.stringify(copied))
      if (command === "cut") {
        context.actions.beginEdit()
        context.actions.cutClips(ids, state.session.timeSelection ?? undefined)
        context.actions.endEdit()
        context.scene.setSelection(new Set())
      }
      return true
    }
    const raw = clipboard.readText() ?? ""
    clipboardMemory.write(raw)
    const payload = parseClipClipboard(raw)
    if (!payload) return false
    const selected = new Set(ids)
    const track =
      state.document.tracks.find(lane => lane.clips.some(clip => selected.has(clip.id))) ??
      state.document.tracks.find(lane => state.session.timeSelection?.trackIds.includes(lane.id)) ??
      state.document.tracks.find(lane => state.session.selectedTrackIds.includes(lane.id))
    const target =
      getTarget() ??
      (track
        ? {
            trackId: track.id,
            bar:
              state.session.timeSelection?.startBar ??
              positionToBar(state.session.position, state.document.transport.numerator),
          }
        : null)
    if (!target) return false
    context.actions.beginEdit()
    const done = context.actions.pasteClips(target.trackId, target.bar, payload)
    context.actions.endEdit()
    if (done) {
      context.scene.setSelection(new Set(context.getState().session.selectedClipIds))
      context.scene.setTargetSelection({ kind: "none" })
    }
    return done
  }
}
