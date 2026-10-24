import type { DockBorderSide, DockBounds, DockLayoutJSON } from "./model"
import { borderRailBounds } from "./border-rails"

export function borderGeometry(
  layout: Pick<DockLayoutJSON, "borders" | "maximizedGroup">,
  root: DockBounds,
  railSize: number,
  separatorWidth: number,
  minimumSize: number
) {
  const railBounds = borderRailBounds(layout, root, railSize)
  const rails = {
    left: railBounds.get("left")?.width ?? 0,
    right: railBounds.get("right")?.width ?? 0,
    bottom: railBounds.get("bottom")?.height ?? 0,
  }
  const area = {
    x: root.x + rails.left,
    y: root.y,
    width: Math.max(0, root.width - rails.left - rails.right),
    height: Math.max(0, root.height - rails.bottom),
  }
  const sizes: Record<DockBorderSide, number> = { left: 0, right: 0, bottom: 0 }
  let width = area.width
  for (const side of ["left", "right"] as const) {
    const border = layout.borders[side]
    if (!border?.selected || border.visible === false || border.type !== "split") continue
    sizes[side] = Math.max(0, Math.min(border.size, width - minimumSize - separatorWidth))
    width -= sizes[side] + separatorWidth
  }
  const bottom = layout.borders.bottom
  if (bottom?.selected && bottom.visible !== false && bottom.type === "split")
    sizes.bottom = Math.max(0, Math.min(bottom.size, area.height - minimumSize - separatorWidth))
  const line = (side: DockBorderSide) => (sizes[side] > 0 ? separatorWidth : 0)
  const main = {
    x: area.x + sizes.left + line("left"),
    y: area.y,
    width: Math.max(0, width),
    height: Math.max(0, area.height - sizes.bottom - line("bottom")),
  }
  const boxes: Partial<Record<DockBorderSide, DockBounds>> = {}
  for (const side of ["left", "right", "bottom"] as const) {
    const border = layout.borders[side]
    if (!border?.selected || border.visible === false) continue
    const split = border.type === "split"
    const base = split ? area : main
    const size = split
      ? sizes[side]
      : Math.min(border.size, side === "bottom" ? main.height : main.width)
    boxes[side] = {
      x: side === "right" ? base.x + base.width - size : base.x,
      y: side === "bottom" ? base.y + base.height - size : base.y,
      width: side === "bottom" ? base.width : size,
      height: side === "bottom" ? size : main.height,
    }
  }
  const maximizedSide = ["left", "right", "bottom"].find(
    side => layout.maximizedGroup === `border:${side}`
  )
  if (maximizedSide) {
    for (const side of ["left", "right", "bottom"] as const) {
      if (
        side === maximizedSide &&
        layout.borders[side]?.selected &&
        layout.borders[side]?.visible !== false
      )
        boxes[side] = area
      else delete boxes[side]
    }
  }
  return { main, boxes }
}
