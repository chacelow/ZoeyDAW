import { dockBorderSides } from "./model"
import type { DockBorderSide, DockBounds, DockLayoutJSON } from "./model"

export function borderRailBounds(
  layout: Pick<DockLayoutJSON, "borders">,
  root: DockBounds,
  size: number
) {
  const result = new Map<DockBorderSide, DockBounds>()
  const left = layout.borders.left && layout.borders.left.visible !== false ? size : 0
  const right = layout.borders.right && layout.borders.right.visible !== false ? size : 0
  for (const side of dockBorderSides) {
    const border = layout.borders[side]
    if (!border || border.visible === false) continue
    result.set(
      side,
      side === "bottom"
        ? {
            x: root.x + left,
            y: root.y + root.height - size,
            width: Math.max(0, root.width - left - right),
            height: size,
          }
        : {
            x: side === "left" ? root.x : root.x + root.width - size,
            y: root.y,
            width: size,
            height: root.height,
          }
    )
  }
  return result
}
