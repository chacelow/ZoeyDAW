import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { Tooltip, TooltipContent } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useMeasuredTextWidth } from "../useMeasuredTextWidth"
import { snapControlWidth } from "../grid"
import { tooltipChrome } from "../Tooltip"
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
  const layoutWidth = useRef<number | undefined>(undefined)
  const [truncated, setTruncated] = useState(false)
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
  useLayoutEffect(() => {
    const available = layoutWidth.current ?? resolvedWidth ?? resolvedMaxWidth
    setTruncated(measurement.measured && available !== undefined && measurement.width > available)
  }, [measurement.measured, measurement.width, resolvedWidth, resolvedMaxWidth])
  const handleLayout = useCallback<NonNullable<Props["onLayout"]>>(event => {
    if (event.width !== undefined) {
      layoutWidth.current = event.width
      setTruncated(measurement.measured && measurement.width > event.width)
    }
    onLayout?.(event)
  }, [measurement.measured, measurement.width, onLayout])
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
      onLayout={handleLayout}
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
            style={sx(contentStyle, { display: "flex", alignItems: "center", width: "100%" })}
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
            onLayout={handleLayout}
          >
            <text
              style={{
                ...textStyle,
                minWidth: 0,
                textAlign: style?.textAlign,
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
            style={tooltipChrome(theme)}
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
