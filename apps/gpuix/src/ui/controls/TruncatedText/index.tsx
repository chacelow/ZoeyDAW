import { useState } from "react"
import { Tooltip, TooltipContent } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useMeasuredTextWidth } from "../useMeasuredTextWidth"
import { snapControlWidth } from "../grid"
import type { Props } from "@gpuix/react"

export interface TruncatedTextProps extends Omit<Props, "children" | "onChange"> {
  readonly children: string
  readonly width?: number
  readonly maxWidth?: number
  readonly hovered?: boolean
}

export function TruncatedText({
  children,
  width,
  maxWidth,
  hovered: ownerHovered,
  style,
  onLayout,
  testId,
  ...props
}: TruncatedTextProps) {
  const theme = useTheme()
  const unit = theme.control["--spacing-control-track"]
  const [layoutWidth, setLayoutWidth] = useState<number>()
  const [hovered, setHovered] = useState(false)
  const textStyle = {
    fontSize: style?.fontSize ?? theme.control["--text-control-track"],
    fontFamily: style?.fontFamily,
    fontWeight: style?.fontWeight,
    lineHeight: style?.lineHeight,
  }
  const measurement = useMeasuredTextWidth([children], textStyle)
  const resolvedWidth = width === undefined ? undefined : snapControlWidth(width, unit)
  const resolvedMaxWidth = maxWidth === undefined ? undefined : snapControlWidth(maxWidth, unit)
  const available = layoutWidth ?? resolvedWidth ?? resolvedMaxWidth
  const truncated = measurement.measured && available !== undefined && measurement.width > available
  const contentStyle = sx(
    {
      minWidth: 0,
      flexShrink: 1,
      flexGrow: resolvedWidth === undefined ? 1 : 0,
      width: resolvedWidth,
      maxWidth: resolvedMaxWidth,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      keyboardFocusDim: false,
      ...textStyle,
    },
    style,
    ownerHovered !== undefined && { pointerEvents: "none" }
  )
  const text = (
    <text
      {...props}
      testId={testId}
      onLayout={event => {
        if (event.width !== undefined) setLayoutWidth(event.width)
        onLayout?.(event)
      }}
      style={contentStyle}
    >
      {children}
    </text>
  )
  return (
    <>
      {measurement.sampleNodes}
      {truncated ? (
        <Tooltip
          open={ownerHovered ?? hovered}
          onOpenChange={setHovered}
          style={{
            display: "flex",
            minWidth: 0,
            flexBasis: style?.flexBasis,
            flexShrink: style?.flexShrink ?? 1,
            flexGrow: style?.flexGrow ?? (resolvedWidth === undefined ? 1 : 0),
            width: resolvedWidth,
            maxWidth: resolvedMaxWidth,
            pointerEvents: ownerHovered === undefined ? "auto" : "none",
          }}
          disableHoverableContent
        >
          <div
            {...props}
            testId={testId}
            tabIndex={-1}
            style={sx(contentStyle, { display: "flex", width: "100%" })}
            onMouseEnter={
              ownerHovered === undefined
                ? event => {
                    setHovered(true)
                    props.onMouseEnter?.(event)
                  }
                : undefined
            }
            onMouseLeave={
              ownerHovered === undefined
                ? event => {
                    setHovered(false)
                    props.onMouseLeave?.(event)
                  }
                : undefined
            }
            onLayout={event => {
              if (event.width !== undefined) setLayoutWidth(event.width)
              onLayout?.(event)
            }}
          >
            <text
              style={{
                ...textStyle,
                minWidth: 0,
                width: "100%",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                pointerEvents: "none",
                keyboardFocusDim: false,
              }}
            >
              {children}
            </text>
          </div>
          <TooltipContent
            side="bottom"
            sideOffset={theme.design.overlay.sideOffset}
            testId={testId ? `${testId}-tooltip` : undefined}
            style={{
              padding: theme.design.menu.inset,
              maxWidth: theme.design.menu.maxWidth,
              borderWidth: theme.design.menu.borderWidth,
              borderColor: theme.colors.border,
              borderRadius: theme.design.menu.radius,
              backgroundColor: theme.colors.popover,
              color: theme.colors.popoverForeground,
              fontSize: theme.control["--text-control-track"],
            }}
          >
            {children}
          </TooltipContent>
        </Tooltip>
      ) : (
        text
      )}
    </>
  )
}
