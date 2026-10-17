import type { DockBounds, DockNode, DockSplit } from "./model"

export function splitBounds(node: DockSplit, bounds: DockBounds, separatorWidth: number): DockBounds[] {
  const horizontal = node.orientation === "horizontal"
  const available = Math.max(0, (horizontal ? bounds.width : bounds.height) - separatorWidth * (node.children.length - 1))
  const total = node.sizes.reduce((sum, size) => sum + size, 0)
  let offset = 0
  return node.children.map((_, index) => {
    const size = available * node.sizes[index] / total
    const box = horizontal
      ? { ...bounds, x: bounds.x + offset, width: size }
      : { ...bounds, y: bounds.y + offset, height: size }
    offset += size + separatorWidth
    return box
  })
}

export function projectDockGroups(node: DockNode | null, bounds: DockBounds, separatorWidth: number): Map<string, DockBounds> {
  const groups = new Map<string, DockBounds>()
  const visit = (item: DockNode, box: DockBounds) => {
    if (item.kind === "group") { groups.set(item.id, box); return }
    const children = splitBounds(item, box, separatorWidth)
    item.children.forEach((child, index) => visit(child, children[index]))
  }
  if (node) visit(node, bounds)
  return groups
}
