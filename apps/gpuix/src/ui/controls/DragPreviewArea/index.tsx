import { consumeKey } from "@/shared/keyboard"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import type { EventPayload, KeyEvent, Props } from "@gpuix/react"
import type { ReactNode } from "react"

export interface DragPreviewItem<T> {
  key: string
  data: T
  children: ReactNode
  disabled?: boolean
  label?: string
}
type DragSources<T> =
  | { data: T; children: ReactNode; items?: never }
  | { items: readonly DragPreviewItem<T>[]; children?: ReactNode; data?: never }
export type DragPreviewAreaProps<T> = Omit<Props, "children"> &
  DragSources<T> & {
    renderPreview: (data: T) => ReactNode
    disabledDropLabel: string
    disabled?: boolean
    threshold?: number
    onDragStart?: (data: T) => void
    onDragEnd?: (data: T, result: { cancelled: boolean }) => void
  }
interface Press<T> {
  key: string
  data: T
  x: number
  y: number
  dragging: boolean
}
interface Preview<T> {
  source: Press<T>
  content: ReactNode
  x: number
  y: number
}

export function DragPreviewArea<T>(props: DragPreviewAreaProps<T>) {
  const {
    items,
    data: _data,
    children,
    renderPreview,
    disabledDropLabel,
    disabled = false,
    threshold = 4,
    onDragStart,
    onDragEnd,
    style,
    role = "button",
    tabIndex = 0,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onKeyDown,
    onBlur,
    onClick,
    ...native
  } = props
  const theme = useTheme()
  const { renderer } = useGpuix()
  const pressed = useRef<Press<T> | null>(null)
  const suppressClick = useRef(false)
  const endCallback = useRef(onDragEnd)
  useLayoutEffect(() => {
    endCallback.current = onDragEnd
  }, [onDragEnd])
  useEffect(
    () => () => {
      const source = pressed.current
      pressed.current = null
      if (source?.dragging) endCallback.current?.(source.data, { cancelled: true })
    },
    []
  )
  const [preview, setPreview] = useState<Preview<T> | null>(null)
  const finish = (cancelled: boolean) => {
    const source = pressed.current
    pressed.current = null
    setPreview(null)
    if (source?.dragging) onDragEnd?.(source.data, { cancelled })
  }
  useEffect(() => {
    if (disabled) {
      const source = pressed.current
      pressed.current = null
      setPreview(null)
      if (source?.dragging) onDragEnd?.(source.data, { cancelled: true })
    }
  }, [disabled, onDragEnd])
  const begin = (event: EventPayload, key: string, sourceData: T, unavailable: boolean) => {
    suppressClick.current = false
    if (unavailable || event.button !== 0 || event.x === undefined || event.y === undefined) return
    pressed.current = { key, data: sourceData, x: event.x, y: event.y, dragging: false }
    renderer?.focusElement?.(event.elementId)
    onMouseDown?.(event)
  }
  const move = (event: EventPayload) => {
    const source = pressed.current
    if (!source) {
      onMouseMove?.(event)
      return
    }
    if (event.pressedButton !== 0) {
      finish(true)
      return
    }
    if (event.x === undefined || event.y === undefined) return
    if (!source.dragging) {
      if (Math.hypot(event.x - source.x, event.y - source.y) < threshold) return
      const content = renderPreview(source.data)
      if (content === null || content === undefined) return
      source.dragging = true
      suppressClick.current = true
      setPreview({ source, content, x: event.x, y: event.y })
      onDragStart?.(source.data)
    } else {
      setPreview(previous =>
        previous ? { ...previous, x: event.x ?? previous.x, y: event.y ?? previous.y } : previous
      )
    }
    onMouseMove?.(event)
  }
  const release = (event: EventPayload) => {
    finish(false)
    onMouseUp?.(event)
  }
  const keyDown = (event: KeyEvent) => {
    if (event.key === "escape") {
      if (pressed.current) consumeKey(event, "handled")
      finish(true)
    } else onKeyDown?.(event)
  }
  const blur = (event: EventPayload) => {
    finish(true)
    onBlur?.(event)
  }
  const click = (event: EventPayload) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (!disabled) onClick?.(event)
  }
  const variants = sv({
    base: {
      userSelect: "none",
      keyboardFocusDim: false,
      focusVisible: {
        outlineWidth: theme.design.shape.focusRingWidth,
        outlineColor: theme.colors.ring,
        outlineOffset: -theme.design.shape.focusRingWidth,
      },
    },
    variants: {
      state: {
        idle: { cursor: "grab" },
        dragging: { cursor: "grabbing", opacity: 0.4 },
        disabled: { cursor: "not-allowed", opacity: 0.5, focusVisible: undefined },
      },
    },
  })
  const sources: readonly DragPreviewItem<T>[] = props.items
    ? props.items
    : [{ key: "source", data: props.data, children: props.children }]
  return (
    <div {...native} role="group" style={sx({ display: "flex", flexDirection: "column" }, style)}>
      {items ? children : null}
      {sources.map(source => (
        <div
          key={source.key}
          role={role}
          tabIndex={tabIndex}
          aria-label={source.label}
          aria-disabled={disabled || !!source.disabled}
          testId={`drag-source-${source.key}`}
          style={variants({
            state:
              disabled || source.disabled
                ? "disabled"
                : preview?.source.key === source.key
                  ? "dragging"
                  : "idle",
          })}
          onMouseDown={event =>
            begin(event, source.key, source.data, disabled || !!source.disabled)
          }
          onMouseMove={move}
          onMouseUp={release}
          onKeyDown={keyDown}
          onBlur={blur}
          onClick={event => {
            if (!source.disabled) click(event)
          }}
        >
          {source.children}
        </div>
      ))}
      {preview ? (
        <anchored
          position={{ x: preview.x, y: preview.y }}
          offset={{ x: 12, y: 12 }}
          anchor="topLeft"
          fit="snap"
          priority={1000}
          occlude={false}
          testId="drag-preview"
          style={{
            pointerEvents: "none",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 8,
            maxWidth: 320,
            opacity: 0.85,
            borderRadius: theme.design.popover.radius,
            borderWidth: theme.design.popover.borderWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.popover,
            color: theme.colors.popoverForeground,
            fontSize: theme.control["--text-control-track"],
          }}
        >
          {preview.content}
          <div
            role="status"
            aria-label={disabledDropLabel}
            style={{ color: theme.colors.destructive }}
          >
            ⊘
          </div>
        </anchored>
      ) : null}
    </div>
  )
}
