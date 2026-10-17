import { useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, KeyEvent, PublicInstance } from "@gpuix/react"
import { consumeKey } from "@/shared/keyboard"
import { useControlEnvironment } from "@/ui/controls/ControlEnvironment"
import { moveGroupOrPanel, moveToBorder, resolveDropPosition } from "./model"
import type { DockBorderSide, DockBounds, DockDragSource, DockLayoutJSON, DockNode, DockPosition } from "./model"
export interface DockDropTarget {
  groupId: string
  position: DockPosition
  index?: number
  border?: DockBorderSide
  railGroup?: "start" | "end"
  railOffset?: number
}
export interface DockDragController {
  readonly target: DockDropTarget | null
  start(source: DockDragSource, event: EventPayload): void
  move(event: EventPayload): DockDropTarget | null
  release(event: EventPayload): void
  click(activate: () => void): void
  cancel(): void
  keyDown(event: KeyEvent): void
}
export function useDockDrag({
  layout,
  onLayoutChange,
  edgeFraction,
  stripHeight,
  groups,
  tabs,
  tabRefs,
  borders,
  borderSize,
  rootBounds,
}: {
  layout: DockLayoutJSON
  onLayoutChange: (layout: DockLayoutJSON) => void
  edgeFraction: number
  stripHeight: number
  groups: RefObject<Map<string, DockBounds>>
  tabs: RefObject<Map<string, DockBounds>>
  tabRefs: RefObject<Map<string, PublicInstance>>
  borders: RefObject<Map<DockBorderSide, DockBounds>>
  borderSize: number
  rootBounds: RefObject<DockBounds>
}): DockDragController {
  const { renderer } = useGpuix()
  const environment = useControlEnvironment()
  const press = useRef<{
    source: DockDragSource
    x: number
    y: number
    elementId: number
    dragging: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const [target, setTarget] = useState<DockDropTarget | null>(null)
  const cancel = () => {
    press.current = null
    setTarget(null)
  }
  useEffect(
    () =>
      environment.subscribeWindowActive?.(active => {
        if (!active) {
          press.current = null
          setTarget(null)
        }
      }),
    [environment]
  )
  const locate = (x: number, y: number): DockDropTarget | null => {
    for (const [side, box] of borders.current) {
      if (!resolveDropPosition(box, x, y, edgeFraction)) continue
      const border = layout.borders[side]
      if (!border) continue
      const horizontal = side === "bottom"
      const pointer = horizontal ? x : y
      const start = horizontal ? box.x : box.y
      const length = horizontal ? box.width : box.height
      const railGroup = pointer < start + (length - stripHeight) / 2 ? "start" : "end"
      const items = railGroup === "start" ? border.tabs : border.end ?? []
      const origin = railGroup === "start" ? start : start + length - stripHeight * (items.length + 1)
      const index = Math.max(0, Math.min(items.length, Math.floor((pointer - origin + stripHeight / 2) / stripHeight)))
      return { groupId: `border:${side}`, position: "center", border: side, railGroup, index, railOffset: origin - start + index * stripHeight }
    }
    if (!layout.root && resolveDropPosition(rootBounds.current, x, y, edgeFraction))
      return { groupId: "dock-empty", position: "center" }
    for (const [groupId, box] of groups.current) {
      if (layout.maximizedGroup && layout.maximizedGroup !== groupId) continue
      const position = resolveDropPosition(box, x, y, edgeFraction)
      if (!position) continue
      const group = layout.root && findTabs(layout.root, groupId)
      if (!group) continue
      if (group && y < box.y + stripHeight) {
        const index = group.findIndex(tab => {
          const rect = tabs.current.get(tab)
          return rect && x < rect.x + rect.width / 2
        })
        return { groupId, position: "center", index: index === -1 ? group.length : index }
      }
      return { groupId, position }
    }
    return null
  }
  const move = (event: EventPayload) => {
    const current = press.current
    if (!current || event.x === undefined || event.y === undefined) return null
    if (renderer?.getFocusedElementId && renderer.getFocusedElementId() !== current.elementId) {
      cancel()
      return null
    }
    if (!current.dragging) {
      const threshold = environment.inputPolicy?.dragThresholdPixels
      if (
        threshold === undefined ||
        Math.hypot(event.x - current.x, event.y - current.y) < threshold
      )
        return null
      current.dragging = true
      suppressClick.current = true
    }
    renderer?.clearSelection?.()
    const next = locate(event.x, event.y)
    setTarget(next)
    return next
  }
  return {
    target,
    start: (source: DockDragSource, event: EventPayload) => {
      if (event.button !== 0 || event.x === undefined || event.y === undefined) return
      renderer?.clearSelection?.()
      tabs.current.clear()
      for (const [id, tab] of tabRefs.current) {
        const box = renderer?.getElementBounds?.(tab.id)
        if (box) tabs.current.set(id, box)
      }
      press.current = {
        source,
        x: event.x,
        y: event.y,
        elementId: event.elementId,
        dragging: false,
      }
      suppressClick.current = false
      renderer?.focusElement?.(event.elementId)
    },
    move,
    release: (event: EventPayload) => {
      const next = move(event)
      const current = press.current
      cancel()
      if (current?.dragging && next)
        onLayoutChange(
          next.border
            ? moveToBorder(layout, current.source, next.border, borderSize, { group: next.railGroup ?? "start", index: next.index ?? 0 })
            : moveGroupOrPanel(layout, current.source, next.groupId, next.position, next.index)
        )
    },
    click: (activate: () => void) => {
      if (!suppressClick.current) activate()
      suppressClick.current = false
    },
    cancel,
    keyDown: (event: KeyEvent) => {
      if (event.key === "escape" && press.current) {
        cancel()
        consumeKey(event, "handled")
      }
    },
  }
}
function findTabs(node: DockNode, id: string): readonly string[] | null {
  if (node.kind === "group") return node.id === id ? node.tabs : null
  for (const child of node.children) {
    const found = findTabs(child, id)
    if (found) return found
  }
  return null
}
export function readBounds(event: EventPayload): DockBounds | null {
  return event.x !== undefined &&
    event.y !== undefined &&
    event.width !== undefined &&
    event.height !== undefined
    ? { x: event.x, y: event.y, width: event.width, height: event.height }
    : null
}
