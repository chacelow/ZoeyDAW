import { useGpuix, useWindowSize } from "@gpuix/react"
import { setRefs } from "@gpuix/react/floating"
import { FloatingLayer } from "../FloatingLayer"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { EventPayload, NativeRenderer, PublicInstance } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"

import { useMenu } from "./context"
import { focusEntry, navigate } from "./navigation"
import type { MenuContentProps } from "./model"

function containsPoint(
  instance: PublicInstance,
  point: EventPayload,
  renderer: NativeRenderer | null
) {
  if (point.x === undefined || point.y === undefined) return false
  const bounds = renderer?.getElementBounds?.(instance.id)
  return (
    !!bounds &&
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  )
}

export function MenuContent({
  children,
  style,
  side,
  align = "start",
  alignOffset = 0,
  sideOffset: providedSideOffset,
  collisionPadding: providedCollisionPadding,
  onMouseDownOutside,
  onKeyDown,
  ref,
  ...props
}: MenuContentProps) {
  const menu = useMenu()
  const theme = useTheme()
  const sideOffset = providedSideOffset ?? theme.design.overlay.sideOffset
  const collisionPadding = providedCollisionPadding ?? theme.design.overlay.collisionPadding
  const { renderer } = useGpuix()
  const viewport = useWindowSize()
  const surface = useRef<PublicInstance | null>(null)
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null)
  const bindRef = useCallback(
    (instance: PublicInstance | null) => {
      if (surface.current) menu.surfaces.delete(surface.current.id)
      surface.current = instance
      if (instance) menu.surfaces.set(instance.id, instance)
      setRefs(instance, ref)
    },
    [menu.surfaces, ref]
  )
  useLayoutEffect(() => {
    const parent = menu.parent
    if (!parent || !menu.open) return
    parent.activeChild.current = menu
    return () => {
      if (parent.activeChild.current?.trigger === menu.trigger) parent.activeChild.current = null
    }
  }, [menu])
  useLayoutEffect(() => {
    if (menu.open && !menu.activeChild.current?.open) {
      if (!focusEntry(menu.entries, renderer, menu.initialEdge.current) && surface.current)
        renderer?.focusElement?.(surface.current.id)
    }
  }, [menu.open, menu.entries, menu.initialEdge, menu.activeChild, renderer])
  const maxWidth = Math.max(0, viewport.width - collisionPadding * 2)
  const maxHeight = Math.max(0, viewport.height - collisionPadding * 2)
  const requestedSide = side ?? (menu.parent ? "right" : "bottom")
  const anchor = menu.trigger.current && renderer?.getElementBounds?.(menu.trigger.current.id)
  const size = measuredSize ?? { width: typeof style?.width === "number" ? style.width : theme.design.menu.width, height: typeof style?.height === "number" ? style.height : 0 }
  let resolvedSide = requestedSide
  if (anchor) {
    const spaces = { top: anchor.y - collisionPadding, bottom: viewport.height - anchor.y - anchor.height - collisionPadding, left: anchor.x - collisionPadding, right: viewport.width - anchor.x - anchor.width - collisionPadding }
    const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const
    const extent = requestedSide === "top" || requestedSide === "bottom" ? size.height : size.width
    if (extent + sideOffset > spaces[requestedSide] && extent + sideOffset <= spaces[opposite[requestedSide]]) resolvedSide = opposite[requestedSide]
  }
  const surfaceStyle = sx(
    {
      display: "flex",
      flexDirection: "column",
      width: theme.design.menu.width,
      padding: theme.design.menu.inset,
      borderWidth: theme.design.menu.borderWidth,
      borderRadius: theme.design.menu.radius,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.popover,
      color: theme.colors.popoverForeground,
      fontSize: theme.control["--text-control-track"],
      whiteSpace: "normal",
      overflowY: "auto",
      keyboardFocusDim: false,
    },
    style,
    {
      maxWidth: Math.min(maxWidth, typeof style?.maxWidth === "number" ? style.maxWidth : maxWidth),
      maxHeight: Math.min(
        maxHeight,
        typeof style?.maxHeight === "number" ? style.maxHeight : maxHeight
      ),
    }
  )
  if (!menu.open) return null
  const content = (
    <FloatingLayer
      {...props}
      ref={bindRef}
      role="menu"
      tabIndex={0}
      aria-disabled={false}
      onLayout={event => {
        if (event.width === undefined || event.height === undefined) return
        const next = { width: event.width, height: event.height }
        setMeasuredSize(previous => previous?.width === next.width && previous.height === next.height ? previous : next)
        props.onLayout?.(event)
      }}
      side={resolvedSide}
      align={align}
      alignOffset={alignOffset}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      style={surfaceStyle}
      onMouseDownOutside={event => {
        if ([...menu.surfaces.values()].some(instance => containsPoint(instance, event, renderer)))
          return
        onMouseDownOutside?.(event)
        menu.closeAll()
      }}
      onKeyDown={event => {
        if (renderer?.getFocusedElementId?.() !== surface.current?.id) return
        onKeyDown?.(event)
        navigate(menu, renderer, event)
      }}
    >
      {children}
    </FloatingLayer>
  )
  if (menu.contextMenu && !menu.parent && menu.pointer) {
    return (
      <anchored position={menu.pointer} deferred fit="switch" snapMargin={collisionPadding}>
        <div style={{ width: 0, height: 0 }}>{content}</div>
      </anchored>
    )
  }
  return content
}
