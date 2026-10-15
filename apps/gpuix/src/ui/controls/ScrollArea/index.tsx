import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { Props, StyleDesc } from "@gpuix/react"

export { ControlledScrollbar } from "./ControlledScrollbar"
export type { ControlledScrollbarProps } from "./ControlledScrollbar"

export interface ScrollAreaProps extends Props {
  readonly orientation?: "vertical" | "horizontal" | "both"
  readonly wheelToHorizontal?: boolean
  readonly fill?: boolean
  readonly size?: { readonly width: number; readonly height: number }
  readonly height?: StyleDesc["height"]
  readonly maxHeight?: StyleDesc["maxHeight"]
}

export function ScrollArea({
  orientation = "vertical",
  wheelToHorizontal = false,
  fill = false,
  size,
  height,
  maxHeight,
  style,
  onScroll,
  ...props
}: ScrollAreaProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const boundedHeight =
    size?.height ??
    height ??
    style?.height ??
    (fill ? "100%" : theme.control["--spacing-control-track"] * 20)
  return (
    <div
      {...props}
      role={props.role ?? "region"}
      tabIndex={props.tabIndex ?? 0}
      aria-disabled={false}
      onScroll={event => {
        onScroll?.(event)
        if (
          !wheelToHorizontal ||
          orientation !== "horizontal" ||
          event.deltaX ||
          !event.deltaY ||
          event.modifiers?.ctrl ||
          event.modifiers?.cmd
        )
          return
        const offset = renderer?.getScrollOffset?.(event.elementId)
        if (offset) renderer?.scrollTo?.(event.elementId, (offset[0] ?? 0) + event.deltaY, 0)
      }}
      style={sx(
        {
          position: "relative",
          minWidth: 0,
          minHeight: 0,
          keyboardFocusDim: false,
          focusVisible: {
            outlineWidth: theme.design.shape.focusRingWidth,
            outlineColor: theme.colors.ring,
            outlineOffset: -theme.design.shape.focusRingWidth,
          },
          width: fill ? "100%" : undefined,
          height: boundedHeight,
          maxHeight,
          overflowX: orientation === "vertical" ? "hidden" : "scroll",
          overflowY: orientation === "horizontal" ? "hidden" : "scroll",
        },
        style,
        height === undefined ? undefined : { height },
        maxHeight === undefined ? undefined : { maxHeight },
        size ? { width: size.width, height: size.height } : undefined
      )}
    />
  )
}
