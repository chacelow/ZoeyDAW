import { useGpuix, useWindowSize } from "@gpuix/react"
import { FloatingLayer, setRefs } from "@gpuix/react/floating"
import { useCallback, useLayoutEffect, useRef } from "react"
import type { EventPayload, NativeRenderer, PublicInstance } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { readOuterBounds } from "../useMeasuredTextWidth"
import { useMenu } from "./context"
import { focusEntry, navigate } from "./navigation"
import type { MenuContentProps } from "./model"

function containsPoint(
  instance: PublicInstance,
  point: EventPayload,
  renderer: NativeRenderer | null
) {
  if (point.x === undefined || point.y === undefined) return false
  const bounds = readOuterBounds(renderer, instance)
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
  sideOffset = 4,
  collisionPadding = 8,
  onMouseDownOutside,
  onKeyDown,
  ref,
  ...props
}: MenuContentProps) {
  const menu = useMenu()
  const theme = useTheme()
  const { renderer } = useGpuix()
  const viewport = useWindowSize()
  const surface = useRef<PublicInstance | null>(null)
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
  const resolvedSide = side ?? (menu.parent ? "right" : "bottom")
  const surfaceStyle = sx(
    {
      display: "flex",
      flexDirection: "column",
      width: theme.control["--spacing-control-track"] * 10,
      padding: 4,
      borderWidth: 1,
      borderRadius: 4,
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
      <anchored position={menu.pointer} deferred fit="snap" snapMargin={collisionPadding}>
        <div style={{ width: 0, height: 0 }}>{content}</div>
      </anchored>
    )
  }
  return content
}
