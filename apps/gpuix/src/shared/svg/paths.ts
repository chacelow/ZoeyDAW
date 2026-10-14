/**
 * Path data for gpuix shapes, built with d3 (never concatenated by hand). Every function returns a
 * path `d` string; `Shape` turns one or more of them into a tinted native `<svg>`.
 */
import { path as d3path } from "d3-path"
import { line } from "d3-shape"

export interface Point {
  readonly x: number
  readonly y: number
}

export interface CubicSegment {
  readonly control1: Point
  readonly control2: Point
  readonly end: Point
}

const DIGITS = 2

/** Polyline through the given samples (automation curves, waveforms, envelopes). Empty input is a bug, not a blank path. */
export function polylinePath(points: readonly Point[]): string {
  if (points.length === 0) {
    throw new RangeError("polylinePath needs at least one point")
  }
  const d = line<Point>()
    .x(point => point.x)
    .y(point => point.y)
    .digits(DIGITS)(points)
  if (d === null) {
    throw new RangeError("polylinePath produced no path")
  }
  return d
}

/** One continuous cubic Bézier chain starting at `start` (clip fades and other explicit curves). */
export function cubicPath(start: Point, segments: readonly CubicSegment[]): string {
  const context = d3path()
  context.moveTo(start.x, start.y)
  for (const segment of segments) {
    context.bezierCurveTo(
      segment.control1.x,
      segment.control1.y,
      segment.control2.x,
      segment.control2.y,
      segment.end.x,
      segment.end.y
    )
  }
  return context.toString()
}

/** Closed polygon (markers, arrows). */
export function polygonPath(points: readonly Point[]): string {
  const context = d3path()
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y)
    } else {
      context.lineTo(point.x, point.y)
    }
  })
  context.closePath()
  return context.toString()
}

/** Straight segments that are not connected to each other (grid lines): one `M…L…` pair each. */
export function segmentsPath(segments: ReadonlyArray<readonly [Point, Point]>): string {
  const context = d3path()
  for (const [from, to] of segments) {
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
  }
  return context.toString()
}
