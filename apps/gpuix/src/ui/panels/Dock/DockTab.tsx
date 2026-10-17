import { memo, useContext, useLayoutEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, Props, PublicInstance } from "@gpuix/react"
import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { IconSlot, TruncatedText } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import type { IconName } from "@/ui/controls/Icon"
import { PanelEnvironmentContext } from "../PanelEnvironment"

export interface DockTabProps extends Props {
  title: string
  selected: boolean
  icon?: IconName
  iconOnly?: boolean
  indicator?: "left" | "top"
  size?: "small" | "default" | "large"
  closeLabel?: string
  closeTestId?: string
  onClose?: () => void
}

export const DockTab = memo(function DockTab({
  title,
  selected,
  icon,
  iconOnly,
  indicator,
  size = "default",
  closeLabel,
  closeTestId,
  onClose,
  style,
  onClick,
  onMouseDown,
  onKeyDown,
  ...props
}: DockTabProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const close = useRef<PublicInstance | null>(null)
  const [hovered, setHovered] = useState(false)
  const bounds = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const { subscribePointer } = useContext(PanelEnvironmentContext)
  useLayoutEffect(
    () =>
      subscribePointer?.(point => {
        const box = bounds.current
        setHovered(
          Boolean(
            box &&
            point.x >= box.x &&
            point.x < box.x + box.width &&
            point.y >= box.y &&
            point.y < box.y + box.height
          )
        )
      }),
    [subscribePointer]
  )
  const overClose = (event: EventPayload) => {
    const box = close.current && renderer?.getElementBounds?.(close.current.id)
    return (
      !!box &&
      event.x !== undefined &&
      event.y !== undefined &&
      event.x >= box.x &&
      event.x < box.x + box.width &&
      event.y >= box.y &&
      event.y < box.y + box.height
    )
  }
  return (
    <div
      {...props}
      role="tab"
      aria-label={title}
      aria-selected={selected}
      tabIndex={props.tabIndex ?? (selected ? 0 : -1)}
      onLayout={event => {
        if (
          event.x !== undefined &&
          event.y !== undefined &&
          event.width !== undefined &&
          event.height !== undefined
        )
          bounds.current = { x: event.x, y: event.y, width: event.width, height: event.height }
        props.onLayout?.(event)
      }}
      onMouseEnter={event => {
        setHovered(true)
        props.onMouseEnter?.(event)
      }}
      onMouseLeave={event => {
        const box = bounds.current
        if (
          box &&
          event.x !== undefined &&
          event.y !== undefined &&
          event.x >= box.x &&
          event.x < box.x + box.width &&
          event.y >= box.y &&
          event.y < box.y + box.height
        )
          return
        setHovered(false)
        props.onMouseLeave?.(event)
      }}
      onMouseDown={event => {
        if (!overClose(event)) onMouseDown?.(event)
      }}
      onClick={event => {
        if (onClose && overClose(event)) onClose()
        else onClick?.(event)
      }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (!event.defaultPrevented && event.key === "enter") {
          onClick?.(event)
          consumeKey(event, "handled")
        }
      }}
      style={sx(
        {
          display: "flex",
          flexDirection: iconOnly ? "column" : "row",
          alignItems: "center",
          flexShrink: 0,
          position: "relative",
          justifyContent: iconOnly ? "center" : undefined,
          height: theme.design.dock.tabHeight[size],
          maxWidth: theme.design.dock.tabMaxWidth,
          paddingLeft: theme.control["--spacing-control-track-gap"],
          paddingRight: theme.control["--spacing-control-track-gap"],
          gap: iconOnly ? 0 : theme.control["--spacing-control-gap"],
          minWidth: 0,
          color: selected ? theme.colors.foreground : theme.colors.mutedForeground,
          backgroundColor: selected ? theme.colors.background : "transparent",
          fontSize: theme.control["--text-control-track"],
          cursor: theme.design.cursors.action,
          userSelect: "none",
          keyboardFocusDim: false,
          hover: { backgroundColor: theme.colors.secondary, color: theme.colors.foreground },
          focusVisible: {
            outlineWidth: theme.design.shape.focusRingWidth,
            outlineColor: theme.colors.ring,
            outlineOffset: -theme.design.shape.focusRingWidth,
          },
        },
        style
      )}
    >
      {selected && indicator ? (
        <div
          testId={props.testId ? `${props.testId}-indicator` : undefined}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            pointerEvents: "none",
            backgroundColor: theme.colors.primary,
            ...(indicator === "left"
              ? { width: theme.design.dock.activeIndicatorWidth, height: "100%" }
              : { height: theme.design.dock.activeIndicatorWidth, width: "100%" }),
          }}
        />
      ) : null}
      {icon ? (
        <div
          testId={props.testId ? `${props.testId}-icon` : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            flexGrow: iconOnly ? 1 : 0,
          }}
        >
          <IconSlot>
            <Icon name={icon} />
          </IconSlot>
        </div>
      ) : null}
      {!iconOnly ? <TruncatedText hovered={hovered}>{title}</TruncatedText> : null}
      {onClose ? (
        <div
          ref={close}
          testId={closeTestId}
          role="button"
          aria-label={closeLabel}
          tabIndex={-1}
          onKeyDown={event => {
            if (event.key === "enter") {
              onClose()
              consumeKey(event, "handled")
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: theme.control["--spacing-control-track"],
            height: theme.control["--spacing-control-track"],
            flexShrink: 0,
            opacity: selected || hovered ? 1 : 0,
            hover: { backgroundColor: theme.colors.accent },
          }}
        >
          <div style={{ pointerEvents: "none" }}>
            <IconSlot>
              <Icon name="X" />
            </IconSlot>
          </div>
        </div>
      ) : null}
    </div>
  )
})
