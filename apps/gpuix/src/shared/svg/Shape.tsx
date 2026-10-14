import { serialiseSvg } from "./serialise"
import type { SvgNode } from "./serialise"
import type { StyleInput } from "@/shared/theme/style"

/**
 * A single-colour native shape. gpuix paints `<svg source>` as a tinted image, so every shape takes
 * its colour from `style.color` (`currentColor` inside the markup) and is described as data:
 * `paths` come from `shared/svg/paths`, `circles` from plain numbers. Nothing here is hand-written markup.
 */
export interface ShapePath {
  readonly d: string
  readonly fill?: boolean
  readonly strokeWidth?: number
}

export interface ShapeCircle {
  readonly cx: number
  readonly cy: number
  readonly r: number
}

export interface ShapeProps {
  readonly width: number
  readonly height: number
  /** Coordinate space of the paths; defaults to `0 0 width height`. */
  readonly viewBox?: string
  readonly paths: readonly ShapePath[]
  readonly circles?: readonly ShapeCircle[]
  readonly color: string
  readonly label?: string
  readonly style?: StyleInput
}

function pathNode(path: ShapePath): SvgNode {
  if (path.fill) {
    return ["path", { d: path.d, fill: "currentColor" }]
  }
  return [
    "path",
    {
      d: path.d,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": path.strokeWidth ?? 1,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
  ]
}

function circleNode(circle: ShapeCircle): SvgNode {
  return ["circle", { cx: circle.cx, cy: circle.cy, r: circle.r, fill: "currentColor" }]
}

export function shapeMarkup(
  paths: readonly ShapePath[],
  circles: readonly ShapeCircle[],
  viewBox: string
): string {
  return serialiseSvg([...paths.map(pathNode), ...circles.map(circleNode)], { viewBox })
}

export function Shape({
  width,
  height,
  viewBox,
  paths,
  circles = [],
  color,
  label,
  style,
}: ShapeProps) {
  return (
    <svg
      source={shapeMarkup(paths, circles, viewBox ?? `0 0 ${width} ${height}`)}
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      style={{ width, height, color, flexShrink: 0, ...style }}
    />
  )
}
