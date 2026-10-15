import { useGpuix } from "@gpuix/react"
import { renderSlot, setRefs } from "@gpuix/react/floating"
import { isValidElement, useCallback, useRef } from "react"
import type { EventPayload, KeyEvent, Props, PublicInstance } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useMenu } from "./context"
import { focusEntry, navigate } from "./navigation"
import type { MenuTriggerProps } from "./model"

export function MenuTrigger({
  asChild = false,
  disabled = false,
  children,
  onClick,
  onMouseDown,
  onContextMenu,
  onKeyDown,
  style,
  ref,
  ...props
}: MenuTriggerProps) {
  const menu = useMenu()
  const { renderer } = useGpuix()
  const theme = useTheme()
  const childDisabled =
    asChild && isValidElement<{ disabled?: unknown }>(children) && children.props.disabled === true
  const unavailable = disabled || menu.disabled || childDisabled
  const lastActivation = useRef<EventPayload | null>(null)
  const bindRef = useCallback(
    (instance: PublicInstance | null) => {
      if (menu.trigger.current) menu.surfaces.delete(menu.trigger.current.id)
      menu.trigger.current = instance
      if (instance) menu.surfaces.set(instance.id, instance)
      setRefs(instance, ref)
    },
    [menu.surfaces, menu.trigger, ref]
  )
  const slotProps = {
    ...props,
    role: props.role ?? "button",
    tabIndex: 0,
    disabled: unavailable,
    "aria-disabled": unavailable,
    "aria-haspopup": "menu",
    "aria-expanded": menu.open,
    style: sx(
      {
        keyboardFocusDim: false,
        focusVisible: unavailable
          ? undefined
          : { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
      },
      style
    ),
    onMouseDown: (event: EventPayload) => {
      if (unavailable) return
      onMouseDown?.(event)
    },
    onContextMenu: unavailable
      ? undefined
      : menu.contextMenu
        ? (event: EventPayload) => {
            onContextMenu?.(event)
            menu.setPointer(
              event.x !== undefined && event.y !== undefined ? { x: event.x, y: event.y } : null
            )
            menu.setOpen(true)
          }
        : onContextMenu,
    onClick: (event: EventPayload) => {
      if (unavailable) return
      onClick?.(event)
      if (lastActivation.current === event) return
      lastActivation.current = event
      if (!menu.contextMenu) menu.setOpen(!menu.open)
    },
    onKeyDown: (event: KeyEvent) => {
      if (unavailable) return
      const target = renderer?.getFocusedElementId?.()
      onKeyDown?.(event)
      if (event.defaultPrevented) return
      const key = event.key?.toLowerCase()
      const contextShortcut =
        menu.contextMenu && ((key === "f10" && event.modifiers?.shift) || key === "contextmenu")
      if (!contextShortcut && target !== menu.trigger.current?.id) return
      if (
        (!menu.contextMenu &&
          (key === "enter" ||
            key === "down" ||
            key === "arrowdown" ||
            key === "up" ||
            key === "arrowup")) ||
        (key === "f10" && event.modifiers?.shift) ||
        key === "contextmenu"
      ) {
        if (lastActivation.current === event) return
        lastActivation.current = event
        menu.initialEdge.current = key === "up" || key === "arrowup" ? "last" : "first"
        menu.setPointer(null)
        menu.setOpen(key === "enter" ? !menu.open : true)
        if (menu.open && key !== "enter")
          focusEntry(menu.entries, renderer, menu.initialEdge.current)
      } else if (menu.open && (key === "escape" || key === "esc")) {
        navigate(menu, renderer, event)
      }
    },
  } satisfies Props & {
    disabled: boolean
    "aria-disabled": boolean
    "aria-haspopup": string
    "aria-expanded": boolean
  }
  return renderSlot({ asChild, children, props: slotProps, ref: bindRef })
}
