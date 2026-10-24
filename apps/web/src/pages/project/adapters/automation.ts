import {
  isAutomationTarget,
  resolveAutomationTarget,
  sameAutomationTarget,
  selectedAutomationTarget,
} from "@zoeydaw/project-core/automation-target"
import { clampAutomationCurve } from "@zoeydaw/project-core/automation-curve"
import { uniqueId } from "@zoeydaw/project-core/reducers"
import { get, session, updateTrack, workspace } from "./context"
import type { AutomationPoint, AutomationTarget } from "@zoeydaw/project-core/types"

export const automationActions = {
  replaceAutomationPoints(trackId: string, laneId: string, points: readonly AutomationPoint[]) {
    const track = get().document.tracks.find(item => item.id === trackId)
    if (
      !track ||
      points.some(
        point =>
          !Number.isFinite(point.bar) ||
          point.bar < 1 ||
          !Number.isFinite(point.value) ||
          point.value < 0 ||
          point.value > 1 ||
          (point.curve !== undefined &&
            (!Number.isFinite(point.curve) || point.curve !== clampAutomationCurve(point.curve)))
      )
    ) {
      return
    }
    const lane = track.automation.find(item => item.id === laneId)
    const target = resolveAutomationTarget(
      track,
      laneId,
      selectedAutomationTarget(track, get().session.automationTargets[trackId]),
      get().workspace.automationLanes[trackId] ?? []
    )
    if (
      !target ||
      (!lane && track.automation.some(item => sameAutomationTarget(item.target, target)))
    )
      return
    const sorted = [...points].sort((a, b) => a.bar - b.bar)
    if (
      new Set(sorted.map(point => point.id)).size !== sorted.length ||
      sorted.some((point, index) => index > 0 && point.bar - sorted[index - 1].bar < 0.000001)
    ) {
      return
    }
    if (
      (!lane && !sorted.length) ||
      (lane &&
        lane.points.length === sorted.length &&
        lane.points.every(
          (point, index) =>
            point.id === sorted[index].id &&
            point.bar === sorted[index].bar &&
            point.value === sorted[index].value &&
            point.curve === sorted[index].curve
        ))
    ) {
      return
    }
    const automation = lane
      ? track.automation.map(item => (item.id === laneId ? { ...item, points: sorted } : item))
      : [...track.automation, { id: laneId, target, points: sorted }]
    updateTrack(trackId, { automation })
  },
  setAutomationTarget(trackId: string, target: AutomationTarget | null) {
    const track = get().document.tracks.find(item => item.id === trackId)
    if (!track || (target && !isAutomationTarget(target, track))) return
    session({ automationTargets: { ...get().session.automationTargets, [trackId]: target } })
  },
  addAutomationLane(trackId: string) {
    const state = get()
    const track = state.document.tracks.find(item => item.id === trackId)
    const target =
      track && selectedAutomationTarget(track, state.session.automationTargets[trackId])
    if (!track || !target || !isAutomationTarget(target, track)) return
    const existing = state.workspace.automationLanes[trackId] ?? []
    if (existing.some(item => sameAutomationTarget(item, target))) return
    workspace({
      ...state.workspace,
      automationLanes: { ...state.workspace.automationLanes, [trackId]: [...existing, target] },
    })
  },
  removeAutomationLane(trackId: string, target: AutomationTarget) {
    const state = get()
    const existing = state.workspace.automationLanes[trackId] ?? []
    if (!existing.some(item => sameAutomationTarget(item, target))) return
    workspace({
      ...state.workspace,
      automationLanes: {
        ...state.workspace.automationLanes,
        [trackId]: existing.filter(item => !sameAutomationTarget(item, target)),
      },
    })
  },
  replaceAutomationLane(
    trackId: string,
    previous: AutomationTarget,
    next: AutomationTarget | null
  ) {
    const state = get()
    const track = state.document.tracks.find(item => item.id === trackId)
    if (!track || (next && !isAutomationTarget(next, track))) return
    const existing = state.workspace.automationLanes[trackId] ?? []
    const index = existing.findIndex(item => sameAutomationTarget(item, previous))
    if (
      index === -1 ||
      (next &&
        existing.some((item, position) => position !== index && sameAutomationTarget(item, next)))
    )
      return
    const lanes = [...existing]
    if (next) lanes[index] = next
    else lanes.splice(index, 1)
    workspace({
      ...state.workspace,
      automationLanes: { ...state.workspace.automationLanes, [trackId]: lanes },
    })
  },
  setAutomationPoint(
    trackId: string,
    laneId: string,
    point: Omit<AutomationPoint, "id"> & { id?: string }
  ) {
    const track = get().document.tracks.find(item => item.id === trackId)
    if (
      !track ||
      !Number.isFinite(point.bar) ||
      point.bar < 1 ||
      !Number.isFinite(point.value) ||
      point.value < 0 ||
      point.value > 1 ||
      (point.curve !== undefined &&
        (!Number.isFinite(point.curve) || point.curve !== clampAutomationCurve(point.curve)))
    ) {
      return
    }
    const existing = track.automation.find(item => item.id === laneId)?.points ?? []
    const id =
      point.id ??
      existing.find(item => Math.abs(item.bar - point.bar) < 0.000001)?.id ??
      uniqueId("point")
    automationActions.replaceAutomationPoints(trackId, laneId, [
      ...existing.filter(item => item.id !== id && Math.abs(item.bar - point.bar) >= 0.000001),
      { ...point, id },
    ])
  },
  deleteAutomationPoint(trackId: string, laneId: string, pointId: string) {
    const points = get()
      .document.tracks.find(track => track.id === trackId)
      ?.automation.find(lane => lane.id === laneId)?.points
    if (points?.some(point => point.id === pointId)) {
      automationActions.replaceAutomationPoints(
        trackId,
        laneId,
        points.filter(point => point.id !== pointId)
      )
    }
  },
  deleteAutomationPoints(trackId: string, laneId: string, pointIds: readonly string[]) {
    const points = get()
      .document.tracks.find(track => track.id === trackId)
      ?.automation.find(lane => lane.id === laneId)?.points
    if (points?.some(point => pointIds.includes(point.id))) {
      automationActions.replaceAutomationPoints(
        trackId,
        laneId,
        points.filter(point => !pointIds.includes(point.id))
      )
    }
  },
  resetAutomationCurve(trackId: string, laneId: string, pointId: string) {
    const points = get()
      .document.tracks.find(track => track.id === trackId)
      ?.automation.find(lane => lane.id === laneId)?.points
    if (points?.some(point => point.id === pointId && point.curve !== undefined)) {
      automationActions.replaceAutomationPoints(
        trackId,
        laneId,
        points.map(point => (point.id === pointId ? { ...point, curve: 0 } : point))
      )
    }
  },
}
