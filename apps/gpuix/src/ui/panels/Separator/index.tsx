import { useContext } from "react"
import type { EventPayload, StyleDesc } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { SlotContext, usePanelGroup } from "../context"
import { keyboardDelta } from "../layout/keyboardDelta"
import { useDividerDrag } from "../useDividerDrag"
import { dividerChrome } from "../divider-chrome"

export interface SeparatorProps {
  disabled?: boolean
  hidden?: boolean
  style?: StyleDesc
  testId?: string
  "aria-label"?: string
}

export function Separator({
  disabled,
  hidden,
  style,
  testId,
  "aria-label": label = "Resize panels",
}: SeparatorProps) {
  const group = usePanelGroup()
  const index = useContext(SlotContext)
  const theme = useTheme()
  const vertical = group.orientation === "horizontal"
  const drag = useDividerDrag({
    orientation: vertical ? "vertical" : "horizontal",
    disabled: disabled || hidden,
    start: group.beginDrag,
    move: (snapshot, delta) => group.preview(snapshot, index, delta),
    finish: () => group.endDrag(),
    restore: snapshot => group.endDrag(snapshot),
  })
  const onKeyDown = (event: EventPayload) => {
    if (event.key === "escape") {
      drag.cancel()
      return
    }
    if (disabled || group.sizes.length < 2) return
    const direction =
      event.key === (vertical ? "right" : "down")
        ? 1
        : event.key === (vertical ? "left" : "up")
          ? -1
          : 0
    if (direction === 0) return
    const delta = keyboardDelta(
      group.sizes,
      group.constraints,
      index,
      direction,
      event.modifiers?.shift ? 50 : 10
    )
    const snapshot = group.beginDrag()
    group.preview(snapshot, index, delta)
    group.endDrag()
  }
  if (hidden) return null
  return (
    <div
      role="separator"
      aria-label={label}
      aria-valuetext={`${Math.round(group.sizes[index] ?? 0)} pixels`}
      testId={testId}
      tabIndex={disabled ? -1 : 0}
      onMouseDown={drag.onMouseDown}
      onMouseMove={drag.onMouseMove}
      onMouseUp={drag.onMouseUp}
      onBlur={drag.onBlur}
      onKeyDown={onKeyDown}
      style={sx(dividerChrome(theme, disabled), style, {
        cursor: disabled ? "default" : vertical ? "col-resize" : "row-resize",
        ...(vertical
          ? { width: theme.project.panelGap, height: "100%" }
          : { height: theme.project.panelGap, width: "100%" }),
      })}
    />
  )
}
