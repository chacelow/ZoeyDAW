import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import {
  borderGroupId,
  getGroups,
  moveGroupOrPanel,
  moveToBorder,
  resolveDropPosition,
  dockBorderSides,
  type DockBorderSide,
  type DockBounds,
  type DockDragSource,
  type DockLayoutJSON,
  type DockPosition,
} from "./model"

export interface DropTarget {
  groupId: string
  position: DockPosition
  index?: number
  border?: DockBorderSide
  railGroup?: "start" | "end"
  railOffset?: number
}
const bounds = (node: Element): DockBounds => {
  const box = node.getBoundingClientRect()
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}
interface PointerOptions {
  layout: DockLayoutJSON
  commit: (layout: DockLayoutJSON) => void
  root: React.RefObject<HTMLDivElement | null>
  strip: number
  borderSize: number
  threshold: number
}
export function useDockPointer({
  layout,
  commit,
  root,
  strip,
  borderSize,
  threshold,
}: PointerOptions) {
  const [target, setTarget] = useState<DropTarget | null>(null)
  const press = useRef<{
    source: DockDragSource
    pointerId: number
    x: number
    y: number
    dragging: boolean
    element: HTMLElement
  } | null>(null)
  const suppressed = useRef(false)
  const latest = useRef({ layout, commit, strip, borderSize, threshold })
  // Written in an effect, never during render: React may replay or discard render work, and
  // a render-time write would leak values from UI that never commits.
  useEffect(() => {
    latest.current = { layout, commit, strip, borderSize, threshold }
  }, [layout, commit, strip, borderSize, threshold])
  const cancel = useCallback(() => {
    const held = press.current
    press.current = null
    if (held?.element.hasPointerCapture?.(held.pointerId))
      held.element.releasePointerCapture(held.pointerId)
    setTarget(null)
  }, [])
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !press.current) return
      cancel()
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener("keydown", keyDown, true)
    window.addEventListener("blur", cancel)
    const visibility = () => {
      if (document.hidden) cancel()
    }
    document.addEventListener("visibilitychange", visibility)
    return () => {
      window.removeEventListener("keydown", keyDown, true)
      window.removeEventListener("blur", cancel)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [cancel])
  const locate = useCallback(
    (x: number, y: number): DropTarget | null => {
      const container = root.current
      if (!container) return null
      const { layout: current, strip: unit } = latest.current
      for (const side of dockBorderSides) {
        const rail = container.querySelector(`[data-testid="dock-border-${side}"]`)
        if (!rail) continue
        const box = bounds(rail)
        if (!resolveDropPosition(box, x, y, 0.2)) continue
        const border = current.borders[side]
        if (!border) continue
        const horizontal = side === "bottom"
        const pointer = horizontal ? x : y
        const start = horizontal ? box.x : box.y
        const length = horizontal ? box.width : box.height
        const railGroup = pointer < start + (length - unit) / 2 ? "start" : "end"
        const items = railGroup === "start" ? border.tabs : (border.end ?? [])
        const origin = railGroup === "start" ? start : start + length - unit * (items.length + 1)
        const index = Math.max(
          0,
          Math.min(items.length, Math.floor((pointer - origin + unit / 2) / unit))
        )
        return {
          groupId: borderGroupId(side),
          position: "center",
          border: side,
          railGroup,
          index,
          railOffset: origin - start + index * unit,
        }
      }
      if (!current.root && resolveDropPosition(bounds(container), x, y, 0.2))
        return { groupId: "dock-empty", position: "center" }
      for (const group of getGroups(current.root)) {
        if (current.maximizedGroup && current.maximizedGroup !== group.id) continue
        const element = [...container.querySelectorAll<HTMLElement>("[data-dock-group]")].find(
          node => node.dataset.dockGroup === group.id
        )
        if (!element) continue
        const box = bounds(element)
        const position = resolveDropPosition(box, x, y, 0.2)
        if (!position) continue
        if (y < box.y + unit) {
          const index = group.tabs.findIndex(id => {
            const frame = [
              ...container.querySelectorAll<HTMLElement>("[data-dock-tab-frame]"),
            ].find(node => node.dataset.dockTabFrame === id)
            return (
              frame && x < frame.getBoundingClientRect().x + frame.getBoundingClientRect().width / 2
            )
          })
          return {
            groupId: group.id,
            position: "center",
            index: index === -1 ? group.tabs.length : index,
          }
        }
        return { groupId: group.id, position }
      }
      return null
    },
    [root]
  )
  const move = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const held = press.current
      if (!held || held.pointerId !== event.pointerId) return
      if (!held.dragging) {
        if (Math.hypot(event.clientX - held.x, event.clientY - held.y) < latest.current.threshold)
          return
        held.dragging = true
        suppressed.current = true
      }
      window.getSelection()?.removeAllRanges()
      setTarget(locate(event.clientX, event.clientY))
    },
    [locate]
  )
  const release = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const held = press.current
      if (!held || held.pointerId !== event.pointerId) return
      const found = held.dragging ? locate(event.clientX, event.clientY) : null
      cancel()
      if (!found) return
      const { layout: current, commit: send, borderSize: size } = latest.current
      send(
        found.border
          ? moveToBorder(current, held.source, found.border, size, {
              group: found.railGroup ?? "start",
              index: found.index ?? 0,
            })
          : moveGroupOrPanel(current, held.source, found.groupId, found.position, found.index)
      )
    },
    [cancel, locate]
  )
  const start = useCallback(
    (source: DockDragSource, event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      cancel()
      event.currentTarget.focus()
      press.current = {
        source,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
        element: event.currentTarget,
      }
      suppressed.current = false
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [cancel]
  )
  const click = useCallback((action: () => void) => {
    if (!suppressed.current) action()
    suppressed.current = false
  }, [])
  return {
    target,
    start,
    move,
    release,
    cancel,
    click,
    isDragging: () => press.current?.dragging === true,
  }
}
