import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { edgeScroll } from "../../core/viewport/edge-scroll"
import type { ArrangementViewport, SceneStore } from "../../core/scene"
import type { NativeTimelinePointer } from "./coordinates"

export interface TimelineAutoScroll {
  tick: (now: number) => void
  start: (pointer: NativeTimelinePointer, axis: "horizontal" | "both") => void
  update: (pointer: NativeTimelinePointer) => void
  stop: () => void
  getFrameDemand: () => boolean
  subscribeFrameDemand: (listener: () => void) => () => void
}

export function createTimelineAutoScroll(deps: {
  scene: SceneStore
  edge: number
  readPolicy: () => ArrangementPolicy["autoScroll"]
  setScroll: (x: number, y: number) => ArrangementViewport
  onScroll: (pointer: NativeTimelinePointer) => void
}): TimelineAutoScroll {
  const { scene, readPolicy, setScroll, onScroll } = deps
  let pointer: NativeTimelinePointer | null = null
  let axis: "horizontal" | "both" = "both"
  let last: number | null = null
  const listeners = new Set<() => void>()

  function notifyDemand() {
    for (const listener of listeners) listener()
  }

  function tick(now: number) {
    if (!pointer) return
    const current = scene.get()
    const { scrollX, scrollY } = current.viewport
    const { scrollX: nextX, scrollY: nextY } = edgeScroll({
      viewport: current.viewport,
      bars: current.bars,
      tracks: current.tracks,
      geometry: current.geometry,
      pointer,
      axis,
      edge: deps.edge,
      policy: readPolicy(),
      elapsed: last === null ? 0 : now - last,
    })
    last = now
    if (nextX === scrollX && nextY === scrollY) return
    const accepted = setScroll(nextX, nextY)
    if (accepted.scrollX === scrollX && accepted.scrollY === scrollY) return
    onScroll(pointer)
  }

  return {
    tick,
    getFrameDemand: () => pointer !== null,
    subscribeFrameDemand(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start(next, mode) {
      const wasActive = pointer !== null
      pointer = next
      axis = mode
      last = null
      if (!wasActive) notifyDemand()
    },
    update(next) {
      const wasActive = pointer !== null
      pointer = next
      if (!wasActive) notifyDemand()
    },
    stop() {
      const wasActive = pointer !== null
      pointer = null
      last = null
      if (wasActive) notifyDemand()
    },
  }
}
