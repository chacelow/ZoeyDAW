import {
  arrangementBodyBottom,
  arrangementBodyTop,
  isPinnedTrack,
  layoutTrackRows,
  pinnedTrackHeight,
} from "../layout"
import {
  automationValueAt,
  clampAutomationValue,
  interpolateAutomation,
  normalizedAutomationValue,
} from "@/project/model/automation-curve"
import type { ArrangementScene } from "../scene"
import type { AutomationLane, Track } from "@/project/model/types"

export interface AutomationRow {
  track: Track
  lane: AutomationLane | undefined
  laneId: string
  parameter: AutomationLane["parameter"]
  top: number
  bottom: number
  valueTop: number
  valueHeight: number
}

export function activeAutomationRows(scene: ArrangementScene): AutomationRow[] {
  const geometry = scene.geometry.arrangement
  const bodyBottom = arrangementBodyBottom(scene.viewport.height, geometry)
  const pinnedTop = bodyBottom - pinnedTrackHeight(scene.tracks, scene.geometry.track)
  return layoutTrackRows(scene).flatMap(row => {
    if (
      row.track.collapsed ||
      row.height <= scene.geometry.track.titleHeight + geometry.clip.bodyThresholdInset
    )
      return []
    const titleInset =
      row.track.kind === "audio" || row.track.kind === "midi"
        ? scene.geometry.track.titleHeight + geometry.clip.verticalInset
        : 0
    const top = Math.max(
      row.top + titleInset,
      isPinnedTrack(row.track) ? pinnedTop : arrangementBodyTop(geometry)
    )
    const bottom = Math.min(row.top + row.height, isPinnedTrack(row.track) ? bodyBottom : pinnedTop)
    if (bottom <= top) return []
    const parameter =
      scene.automationParameters[row.track.id] ?? row.track.automation[0]?.parameter ?? "volume"
    const lane = row.track.automation.find(item => item.parameter === parameter)
    return [
      {
        track: row.track,
        lane,
        laneId: lane?.id ?? `${row.track.id}-${parameter}`,
        parameter,
        top,
        bottom,
        valueTop: row.top + titleInset + geometry.automationPointRadius,
        // One pixel keeps normalization well-defined when both endpoint radii consume the row.
        valueHeight: Math.max(1, row.height - titleInset - geometry.automationPointRadius * 2),
      },
    ]
  })
}

export function automationRowValue(row: AutomationRow, bar: number): number {
  const source = row.parameter === "volume" ? row.track.volumeDb : row.track.pan
  return automationValueAt(
    row.lane?.points ?? [],
    bar,
    normalizedAutomationValue(row.parameter, source)
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
