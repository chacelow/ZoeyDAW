import type { RefObject } from "react"
import { findGroup, type DockBorderSide, type DockBounds, type DockLayoutJSON } from "./model"
import { boxStyle, gap, strip } from "./dock-presentation"
import type { DropTarget } from "./useDockPointer"

interface Props {
  drop: DropTarget | null
  layout: DockLayoutJSON
  root: DockBounds
  rootRef: RefObject<HTMLDivElement | null>
  rails: ReadonlyMap<DockBorderSide, DockBounds>
  groups: ReadonlyMap<string, DockBounds>
}

export function DockDropPreview({ drop, layout, root, rootRef, rails, groups }: Props) {
  const dropBox = drop?.border
    ? rails.get(drop.border)
    : drop?.groupId === "dock-empty"
      ? root
      : drop && groups.get(drop.groupId)
  if (drop?.border || !drop || !dropBox) return null
  const group = findGroup(layout, drop.groupId)
  const previousId = drop.index !== undefined ? group?.tabs[drop.index - 1] : undefined
  const firstId = group?.tabs[0]
  const previousTab =
    previousId &&
    rootRef.current?.querySelector<HTMLElement>(`[data-testid="dock-tab-frame-${previousId}"]`)
  const firstTab = firstId
    ? rootRef.current?.querySelector<HTMLElement>(`[data-testid="dock-tab-frame-${firstId}"]`)
    : undefined
  const insertionX = previousTab
    ? previousTab.getBoundingClientRect().right
    : (firstTab?.getBoundingClientRect().left ?? dropBox.x)
  return (
    <div
      className="dock-drop-preview"
      data-testid="dock-drop-preview"
      style={{
        ...boxStyle(dropBox, root),
        left:
          drop.index !== undefined
            ? insertionX - root.x
            : dropBox.x - root.x + (drop.position === "right" ? dropBox.width / 2 : 0),
        top: dropBox.y - root.y + (drop.position === "bottom" ? dropBox.height / 2 : 0),
        width:
          drop.index !== undefined
            ? gap
            : drop.position === "left" || drop.position === "right"
              ? dropBox.width / 2
              : dropBox.width,
        height:
          drop.index !== undefined
            ? strip
            : drop.position === "top" || drop.position === "bottom"
              ? dropBox.height / 2
              : dropBox.height,
        opacity: drop.index !== undefined ? 0.9 : drop.position === "center" ? 0.2 : 0.3,
      }}
    />
  )
}
