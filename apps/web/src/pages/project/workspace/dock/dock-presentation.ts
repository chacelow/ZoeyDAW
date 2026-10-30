import type { CSSProperties, PointerEvent } from "react"
import { AudioLines, FolderSearch, Piano, SlidersHorizontal } from "lucide-react"
import { CONTROL_METRICS, controlMetricStyle } from "@zoeymind/ui"
import type { SectionId } from "@/pages/project/types"
import type { DockBounds, DockDragSource, DockLayoutJSON, DockNode } from "./model"
import type { DockRegistry } from "./DockLayout"

export const unit = CONTROL_METRICS.default["--spacing-control-track"]
export const strip = unit * 2
export const borderDefaultSize = unit * 20
export const minimumSize = unit * 4
export const borderCollapseThreshold = 96
export const gap = 1
export const iconById = {
  browser: FolderSearch,
  arrangement: AudioLines,
  clip: Piano,
  devices: SlidersHorizontal,
} satisfies Record<SectionId, typeof FolderSearch>
export const iconStyle = { ...controlMetricStyle("transport"), fontSize: "var(--text-control)" }
export const dockStyle = { ...controlMetricStyle("default"), fontSize: "var(--text-control-track)" }
export const asPanel = (id: string): id is SectionId => Object.hasOwn(iconById, id)
export const boxStyle = (box: DockBounds, root: DockBounds): CSSProperties => ({
  position: "absolute",
  left: box.x - root.x,
  top: box.y - root.y,
  width: box.width,
  height: box.height,
})
export const nodeMinimum = (
  node: DockNode,
  horizontal: boolean,
  registry: DockRegistry
): number => {
  if (node.kind === "group")
    return Math.max(0, ...node.tabs.map(id => (asPanel(id) ? registry[id].minimumSize : 0)))
  const children = node.children.map(child => nodeMinimum(child, horizontal, registry))
  return (node.orientation === "horizontal") === horizontal
    ? children.reduce((sum, n) => sum + n, 0) + gap * (children.length - 1)
    : Math.max(0, ...children)
}

export type DockUpdate = (transform: (layout: DockLayoutJSON) => DockLayoutJSON) => void

export interface DockDrag {
  start: (source: DockDragSource, event: PointerEvent<HTMLElement>) => void
  move: (event: PointerEvent<HTMLElement>) => void
  release: (event: PointerEvent<HTMLElement>) => void
  cancel: () => void
  click: (action: () => void) => void
}
