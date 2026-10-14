import { useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { scrollbarGeometry } from "./scrollbar-geometry"
import type { Props, PublicInstance } from "@gpuix/react"

export interface ControlledScrollbarProps extends Omit<Props, "children" | "onChange"> {
  readonly "aria-label": string
  readonly "aria-controls": string
  readonly orientation: "horizontal" | "vertical"
  readonly value: number
  readonly viewport: number
  readonly extent: number
  readonly length: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
}

export function ControlledScrollbar({
  orientation,
  value,
  viewport,
  extent,
  length,
  onChange,
  disabled = false,
  style,
  ...props
}: ControlledScrollbarProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const element = useRef<PublicInstance | null>(null)
  const drag = useRef<{ origin: number; value: number } | null>(null)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const horizontal = orientation === "horizontal"
  const thickness = theme.control["--spacing-control-icon-slot"]
  const geometry = scrollbarGeometry(value, viewport, extent, Math.max(0, length - 2), thickness)
  const unavailable = disabled || geometry.maximum === 0
  function publish(next: number) {
    if (!unavailable) onChange(Math.max(0, Math.min(geometry.maximum, next)))
  }
  return (
    <div
      {...props}
      ref={element}
      role="scrollbar"
      tabIndex={unavailable ? -1 : (props.tabIndex ?? 0)}
      aria-disabled={unavailable}
      aria-orientation={orientation}
      aria-controls={props["aria-controls"]}
      aria-valuemin={0}
      aria-valuemax={geometry.maximum}
      aria-valuenow={geometry.value}
      aria-valuetext={String(geometry.value)}
      style={sx(
        {
          position: "relative",
          width: horizontal ? length : thickness,
          height: horizontal ? thickness : length,
          backgroundColor: theme.colors.scrollbarTrack,
          borderWidth: 1,
          borderColor: focused ? theme.colors.ring : theme.colors.scrollbarTrack,
          overflow: "hidden",
          pointerEvents: "auto",
        },
        style
      )}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setDragging(false)
        drag.current = null
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={event => {
        if (unavailable || (event.button !== undefined && event.button !== 0)) return
        const bounds = element.current && renderer?.getElementBounds?.(element.current.id)
        if (!bounds) return
        setDragging(true)
        const pointer = horizontal
          ? (event.x ?? bounds.x) - bounds.x
          : (event.y ?? bounds.y) - bounds.y
        if (pointer >= geometry.offset && pointer <= geometry.offset + geometry.thumb) {
          drag.current = { origin: pointer, value: geometry.value }
        } else {
          const next =
            geometry.travel > 0
              ? ((pointer - geometry.thumb / 2) / geometry.travel) * geometry.maximum
              : 0
          const bounded = Math.max(0, Math.min(geometry.maximum, next))
          publish(bounded)
          drag.current = { origin: pointer, value: bounded }
        }
      }}
      onMouseMove={event => {
        const anchor = drag.current
        const bounds = element.current && renderer?.getElementBounds?.(element.current.id)
        if (!anchor || !bounds || geometry.travel <= 0) return
        const pointer = horizontal
          ? (event.x ?? bounds.x) - bounds.x
          : (event.y ?? bounds.y) - bounds.y
        publish(anchor.value + ((pointer - anchor.origin) / geometry.travel) * geometry.maximum)
      }}
      onMouseUp={() => {
        drag.current = null
        setDragging(false)
      }}
      onScroll={event =>
        publish(
          geometry.value - (horizontal ? event.deltaX || event.deltaY || 0 : (event.deltaY ?? 0))
        )
      }
      onKeyDown={event => {
        const step = Math.max(1, viewport / 10)
        let handled = true
        if (event.key === "home") publish(0)
        else if (event.key === "end") publish(geometry.maximum)
        else if (event.key === "pageup") publish(geometry.value - viewport)
        else if (event.key === "pagedown") publish(geometry.value + viewport)
        else if (event.key === (horizontal ? "left" : "up")) publish(geometry.value - step)
        else if (event.key === (horizontal ? "right" : "down")) publish(geometry.value + step)
        else if (event.key === "escape" && drag.current) {
          publish(drag.current.value)
          drag.current = null
          setDragging(false)
        } else handled = false
        if (handled) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div
        testId={props.testId ? `${props.testId}-thumb` : undefined}
        style={sx({
          position: "absolute",
          left: horizontal ? geometry.offset : 0,
          top: horizontal ? 0 : geometry.offset,
          width: horizontal ? geometry.thumb : thickness - 2,
          height: horizontal ? thickness - 2 : geometry.thumb,
          backgroundColor: unavailable
            ? theme.colors.canvasScrollbar
            : dragging
              ? theme.colors.canvasScrollbarActive
              : hovered
                ? theme.colors.canvasScrollbarHover
                : theme.colors.canvasScrollbar,
          pointerEvents: "none",
        })}
      />
    </div>
  )
}
