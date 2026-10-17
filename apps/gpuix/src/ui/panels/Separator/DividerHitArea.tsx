import { useState } from "react"
import type { Props } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { DividerOverlay } from "../DividerLayer"
import { dividerChrome } from "../divider-chrome"

export function DividerHitArea({
  orientation,
  offset,
  dragging,
  disabled,
  style,
  testId,
  ...props
}: Props & {
  orientation: "vertical" | "horizontal"
  offset: number
  dragging: boolean
  disabled?: boolean
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const vertical = orientation === "vertical"
  const hitSize = theme.project.panelGap
  const lineSize = theme.design.shape.separatorWidth
  const inset = (hitSize - lineSize) / 2
  return (
    <DividerOverlay>
      <div
        {...props}
        role="separator"
        aria-disabled={disabled || undefined}
        testId={testId}
        tabIndex={-1}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={event => {
          setFocused(true)
          props.onFocus?.(event)
        }}
        onBlur={event => {
          setFocused(false)
          props.onBlur?.(event)
        }}
        style={sx(
          {
            position: "absolute",
            pointerEvents: disabled ? "none" : "auto",
            userSelect: "none",
            cursor: disabled
              ? theme.design.cursors.default
              : vertical
                ? theme.design.cursors.columnResize
                : theme.design.cursors.rowResize,
            ...(vertical
              ? { left: offset - inset, top: 0, width: hitSize, height: "100%" }
              : { top: offset - inset, left: 0, height: hitSize, width: "100%" }),
          },
          style
        )}
      >
        <div
          testId={testId ? `${testId}-highlight` : undefined}
          style={sx(dividerChrome(theme, !disabled && (hovered || dragging || focused)), {
            position: "absolute",
            pointerEvents: "none",
            ...(vertical
              ? { left: inset, top: 0, width: lineSize, height: "100%" }
              : { top: inset, left: 0, height: lineSize, width: "100%" }),
          })}
        />
      </div>
    </DividerOverlay>
  )
}
