import {
  clampFadeCurve,
  DEFAULT_FADE_CURVE,
  FADE_CURVE_VERTICAL_SCALE,
  fadeControls,
} from "../../../../model/fades"
import { FADE_HANDLE_PX } from "../clip-geometry"
import type { AudioClip } from "../../../../model/types"
import type { Point } from "../interactions/types"

export interface FadeDrag {
  clip: AudioClip
  edge: "in" | "out"
  handle: "length" | "curve"
  origin: Point
  last: Point
  height: number
  width: number
  gap: number
  curve: number
  position: number
}

export function beginFadeDrag(
  clip: AudioClip,
  edge: FadeDrag["edge"],
  handle: FadeDrag["handle"],
  origin: Point,
  pxPerBar: number,
  height: number
): FadeDrag {
  const original = fadeControls(clip, edge)
  const width = Math.max(1, (original.end - original.start) * pxPerBar)
  return {
    clip,
    edge,
    handle,
    origin,
    last: origin,
    height,
    width,
    gap: Math.min(0.5, Math.max(0.1, FADE_HANDLE_PX / width)),
    curve: clip[edge === "in" ? "fadeInCurve" : "fadeOutCurve"] ?? DEFAULT_FADE_CURVE,
    position: clip[edge === "in" ? "fadeInCurvePosition" : "fadeOutCurvePosition"] ?? 0.5,
  }
}

export function moveFadeDrag(
  state: FadeDrag,
  current: Point,
  pxPerBar: number
): { state: FadeDrag; patch: Partial<AudioClip> | null } {
  const { clip, edge } = state
  const original = fadeControls(clip, edge)
  const other = fadeControls(clip, edge === "in" ? "out" : "in")
  if (state.handle === "curve") {
    const curveKey = edge === "in" ? "fadeInCurve" : "fadeOutCurve"
    const positionKey = edge === "in" ? "fadeInCurvePosition" : "fadeOutCurvePosition"
    const curve = clampFadeCurve(
      state.curve +
        ((edge === "in" ? -1 : 1) * (current.y - state.last.y)) /
          (Math.max(1, state.height) * FADE_CURVE_VERTICAL_SCALE)
    )
    const position = Math.max(
      state.gap,
      Math.min(1 - state.gap, state.position + (current.x - state.last.x) / state.width)
    )
    const patch =
      curve === (clip[curveKey] ?? DEFAULT_FADE_CURVE) && position === (clip[positionKey] ?? 0.5)
        ? null
        : { [curveKey]: curve, [positionKey]: position }
    return { state: { ...state, curve, position, last: current }, patch }
  }
  const delta = (current.x - state.origin.x) / pxPerBar
  if (edge === "in") {
    const end = Math.max(original.start, Math.min(other.start, original.end + delta))
    return { state, patch: end === original.end ? null : { fadeInBars: end - original.start } }
  }
  const start = Math.max(other.end, Math.min(original.end, original.start + delta))
  return { state, patch: start === original.start ? null : { fadeOutBars: original.end - start } }
}
