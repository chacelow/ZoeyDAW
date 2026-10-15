import type { EventPayload, StyleDesc } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { computeLayout } from "../layout/computeLayout"
import { useDividerDrag } from "../useDividerDrag"
import { dividerChrome } from "../divider-chrome"

export interface CollapseDividerProps {
  expanded: boolean
  expandedSize: number
  onExpandedChange: (expanded: boolean) => void
  style?: StyleDesc
  testId?: string
  "aria-label"?: string
}

/** A binary divider for a fixed-height region outside the adjustable Group. */
export function CollapseDivider({
  expanded,
  expandedSize,
  onExpandedChange,
  style,
  testId,
  "aria-label": label = "Toggle fixed panel",
}: CollapseDividerProps) {
  const theme = useTheme()
  const drag = useDividerDrag({
    orientation: "horizontal",
    start: () => expanded,
    move: (anchor, delta) => {
      const free = { min: 0, max: expandedSize, collapsed: 0, collapsible: false, fixed: false }
      const fixed = {
        min: expandedSize,
        max: expandedSize,
        collapsed: 0,
        collapsible: true,
        fixed: true,
      }
      const sizes = computeLayout(anchor ? [0, expandedSize] : [expandedSize, 0], [free, fixed], {
        separator: 0,
        delta,
      })
      onExpandedChange(sizes[1] === expandedSize)
    },
    restore: onExpandedChange,
  })
  const onKeyDown = (event: EventPayload) => {
    if (event.key === "escape") drag.cancel()
    else if (event.key === "up" || event.key === "home") onExpandedChange(true)
    else if (event.key === "down" || event.key === "end") onExpandedChange(false)
  }
  return (
    <div
      role="separator"
      aria-label={label}
      aria-valuetext={`${expanded ? expandedSize : 0} pixels`}
      testId={testId}
      tabIndex={0}
      onMouseDown={drag.onMouseDown}
      onMouseMove={drag.onMouseMove}
      onMouseUp={drag.onMouseUp}
      onBlur={drag.onBlur}
      onKeyDown={onKeyDown}
      style={sx(dividerChrome(theme), style, {
        height: theme.project.panelGap,
        width: "100%",
        cursor: "row-resize",
      })}
    />
  )
}
