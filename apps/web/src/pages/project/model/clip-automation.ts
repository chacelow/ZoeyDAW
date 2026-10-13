import { uniqueId } from "./reducers"
import type { AutomationLane, AutomationPoint, Track } from "./types"

const POINT_EPSILON = 0.000001

/** Resolve overlapping selected Clips against the original document, then apply each breakpoint once. */
export function moveClipAutomation(
  source: readonly Track[],
  projected: Track[],
  selected: ReadonlySet<string>,
  destinations: ReadonlyMap<string, string>,
  deltaBars: number,
  copy: boolean
): Track[] {
  const transfers = new Map<string, Map<AutomationLane["parameter"], AutomationPoint[]>>()
  const removals = new Map<string, Map<string, Set<string>>>()

  for (const track of source) {
    const destinationId = destinations.get(track.id)
    if (!destinationId) continue
    const intervals = track.clips
      .filter(clip => selected.has(clip.id))
      .map(clip => ({ start: clip.startBar, end: clip.startBar + clip.lengthBars }))
    if (!intervals.length) continue

    for (const lane of track.automation) {
      for (const point of lane.points) {
        if (!intervals.some(interval => point.bar >= interval.start && point.bar < interval.end))
          continue
        let byParameter = transfers.get(destinationId)
        if (!byParameter) {
          byParameter = new Map()
          transfers.set(destinationId, byParameter)
        }
        let incoming = byParameter.get(lane.parameter)
        if (!incoming) {
          incoming = []
          byParameter.set(lane.parameter, incoming)
        }
        incoming.push({
          ...point,
          id: copy ? uniqueId("point") : point.id,
          bar: point.bar + deltaBars,
        })
        if (!copy) {
          let byLane = removals.get(track.id)
          if (!byLane) {
            byLane = new Map()
            removals.set(track.id, byLane)
          }
          let ids = byLane.get(lane.id)
          if (!ids) {
            ids = new Set()
            byLane.set(lane.id, ids)
          }
          ids.add(point.id)
        }
      }
    }
  }

  if (!transfers.size) return projected
  return projected.map(track => {
    const incoming = transfers.get(track.id)
    const removed = removals.get(track.id)
    if (!incoming && !removed) return track
    const matched = new Set<AutomationLane["parameter"]>()
    const automation = track.automation.map(lane => {
      const ids = removed?.get(lane.id)
      const points = ids ? lane.points.filter(point => !ids.has(point.id)) : lane.points
      const additions = incoming?.get(lane.parameter)
      if (!additions || matched.has(lane.parameter))
        return points === lane.points ? lane : { ...lane, points }
      matched.add(lane.parameter)
      return { ...lane, points: mergePoints(points, additions) }
    })
    if (incoming) {
      for (const [parameter, points] of incoming) {
        if (!matched.has(parameter))
          automation.push({ id: uniqueId("lane"), parameter, points: mergePoints([], points) })
      }
    }
    return { ...track, automation }
  })
}

/** Breakpoint positions are unique to the same tolerance as the automation edit adapter. */
function mergePoints(
  existing: readonly AutomationPoint[],
  incoming: readonly AutomationPoint[]
): AutomationPoint[] {
  const points = [...existing]
  for (const point of incoming) {
    for (let index = points.length - 1; index >= 0; index--) {
      if (Math.abs(points[index].bar - point.bar) < POINT_EPSILON) points.splice(index, 1)
    }
    points.push(point)
  }
  return points.sort((a, b) => a.bar - b.bar)
}
