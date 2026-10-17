import { useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { KeyEvent, StyleDesc } from "@gpuix/react"
import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { computeLayout } from "../layout/computeLayout"
import { useDividerDrag } from "../useDividerDrag"
import { dividerChrome } from "../divider-chrome"
import { useDividerLayer } from "../DividerLayer"
import { DividerHitArea } from "../Separator/DividerHitArea"

export interface CollapseDividerProps {
  expanded: boolean
  expandedSize: number
  onExpandedChange: (expanded: boolean) => void
  style?: StyleDesc
  testId?: string
  "aria-label": string
  formatAccessiblePixels: (pixels: number) => string
}

export function CollapseDivider({
  expanded,
  expandedSize,
  onExpandedChange,
  style,
  testId,
  "aria-label": label,
  formatAccessiblePixels,
}: CollapseDividerProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const layer = useDividerLayer()
  const [offset, setOffset] = useState(0)
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
  const onKeyDown = (event: KeyEvent) => {
    if (event.key === "escape") {
      if (!drag.cancel()) return
    } else if (event.key === "up" || event.key === "home") onExpandedChange(true)
    else if (event.key === "down" || event.key === "end") onExpandedChange(false)
    else return
    consumeKey(event, "handled")
  }
  return (
    <>
      <div
        testId={testId ? `${testId}-line` : undefined}
        onLayout={event => {
          const origin = layer && renderer?.getElementBounds?.(layer.id)
          if (origin && event.y !== undefined) setOffset(event.y - origin.y)
        }}
        style={sx(dividerChrome(theme), {
          height: theme.design.shape.separatorWidth,
          width: "100%",
        })}
      />
      <DividerHitArea
        orientation="horizontal"
        offset={offset}
        dragging={drag.dragging}
        aria-label={label}
        aria-valuetext={formatAccessiblePixels(expanded ? expandedSize : 0)}
        testId={testId}
        onMouseDown={drag.onMouseDown}
        onMouseMove={drag.onMouseMove}
        onMouseUp={drag.onMouseUp}
        onBlur={drag.onBlur}
        onKeyDown={onKeyDown}
        style={style}
      />
    </>
  )
}
