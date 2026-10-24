import {
  automationLaneId,
  automationTargetSource,
  isAutomationTarget,
  selectedAutomationTarget,
  sameAutomationTarget,
} from "@zoeydaw/project-core/automation-target"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  displayedAutomationTargets,
  EXTRA_AUTOMATION_HEIGHT,
  isPinnedTrack,
  layoutTrackRows,
  pinnedTrackHeight,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import {
  automationValueAt,
  clampAutomationValue,
  interpolateAutomation,
  normalizedAutomationValue,
} from "@zoeydaw/project-core/automation-curve"
import { TRACK_TITLE_HEIGHT } from "@/pages/project/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { AutomationLane, AutomationTarget, Track } from "@zoeydaw/project-core/types"

export const AUTOMATION_POINT_RADIUS = 4

export interface AutomationRow {
  track: Track
  lane: AutomationLane | undefined
  laneId: string
  placement: "primary" | "extra"
  target: AutomationTarget
  top: number
  bottom: number
  valueTop: number
  valueHeight: number
}

export function activeAutomationRows(scene: ArrangementScene): AutomationRow[] {
  if (!scene.automationMode) return []
  const bodyBottom = arrangementBodyBottom(scene.viewport.height)
  const display = { mode: scene.automationMode, lanes: scene.automationLanes }
  const pinnedTop = bodyBottom - pinnedTrackHeight(scene.tracks, display)
  return layoutTrackRows(scene).flatMap(row => {
    if (row.track.collapsed || row.contentHeight <= TRACK_TITLE_HEIGHT + 4) return []
    const titleInset =
      row.track.kind === "audio" || row.track.kind === "midi" ? TRACK_TITLE_HEIGHT + 1 : 0
    const boundaryTop = isPinnedTrack(row.track) ? pinnedTop : arrangementBodyTop()
    const boundaryBottom = isPinnedTrack(row.track) ? bodyBottom : pinnedTop
    const selected = selectedAutomationTarget(row.track, scene.automationTargets[row.track.id])
    const targets = displayedAutomationTargets(row.track, display)
    const entries = [
      ...(selected
        ? [
            {
              target: selected,
              placement: "primary" as const,
              origin: row.top + titleInset,
              height: row.contentHeight - titleInset,
            },
          ]
        : []),
      ...targets.map((target, index) => ({
        target,
        placement: "extra" as const,
        origin: row.top + row.contentHeight + index * EXTRA_AUTOMATION_HEIGHT,
        height: EXTRA_AUTOMATION_HEIGHT,
      })),
    ]
    return entries.flatMap(({ target, placement, origin, height }): AutomationRow[] => {
      if (!isAutomationTarget(target, row.track)) return []
      const top = Math.max(origin, boundaryTop)
      const bottom = Math.min(origin + height, boundaryBottom)
      if (bottom <= top) return []
      const lane = row.track.automation.find(item => sameAutomationTarget(item.target, target))
      return [
        {
          track: row.track,
          lane,
          laneId: lane?.id ?? automationLaneId(row.track.id, target),
          placement,
          target,
          top,
          bottom,
          valueTop: origin + AUTOMATION_POINT_RADIUS,
          valueHeight: Math.max(1, height - AUTOMATION_POINT_RADIUS * 2),
        },
      ]
    })
  })
}

export function automationRowValue(row: AutomationRow, bar: number): number {
  return automationValueAt(
    row.lane?.points ?? [],
    bar,
    normalizedAutomationValue(row.target, automationTargetSource(row.track, row.target))
  )
}

export function automationX(scene: ArrangementScene, bar: number): number {
  return (bar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX
}

export function automationY(row: AutomationRow, value: number): number {
  return row.valueTop + (1 - clampAutomationValue(value)) * row.valueHeight
}

export function automationValue(row: AutomationRow, y: number): number {
  return clampAutomationValue(1 - (y - row.valueTop) / row.valueHeight)
}

export function automationBar(scene: ArrangementScene, x: number): number {
  return 1 + (x + scene.viewport.scrollX) / scene.viewport.pxPerBar
}

export function automationSegmentValue(
  from: { bar: number; value: number; curve?: number },
  to: { bar: number; value: number },
  bar: number
): number {
  return interpolateAutomation(
    from.value,
    to.value,
    (bar - from.bar) / (to.bar - from.bar),
    from.curve
  )
}
