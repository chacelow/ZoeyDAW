import { consumeKey } from "@/shared/keyboard"
import { useGpuix, useWindowSize } from "@gpuix/react"
import { FloatingLayer, floatingRootStyle, renderSlot, setRefs } from "@gpuix/react/floating"
import {
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { EventPayload, KeyEvent, Props, PublicInstance } from "@gpuix/react"
import type { FloatingContentProps } from "@gpuix/react/floating"
import type { RefObject } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"

export interface PopoverProps extends Props {
  open?: boolean
  defaultOpen?: boolean
  disabled?: boolean
  onOpenChange?: (open: boolean) => void
}

export interface PopoverTriggerProps extends Props {
  asChild?: boolean
  disabled?: boolean
}

export type PopoverContentProps = FloatingContentProps
export type PopoverHeaderProps = Props
export type PopoverTitleProps = Props

interface PopoverState {
  open: boolean
  disabled: boolean
  setOpen: (open: boolean) => void
  trigger: RefObject<PublicInstance | null>
  triggerKeyDown: RefObject<((event: KeyEvent) => void) | null>
}

const PopoverContext = createContext<PopoverState | null>(null)

function usePopover() {
  const popover = useContext(PopoverContext)
  if (!popover) throw new Error("Popover components require a Popover root")
  return popover
}

export function Popover({
  open: controlledOpen,
  defaultOpen = false,
  disabled = false,
  onOpenChange,
  children,
  style,
  onKeyDown,
  ...props
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const trigger = useRef<PublicInstance | null>(null)
  const triggerKeyDown = useRef<((event: KeyEvent) => void) | null>(null)
  const { renderer } = useGpuix()
  const open = !disabled && (controlledOpen ?? internalOpen)
  const setOpen = useCallback(
    (next: boolean) => {
      if (disabled && next) return
      if (controlledOpen === undefined) setInternalOpen(next)
      if (open !== next) onOpenChange?.(next)
    },
    [controlledOpen, disabled, onOpenChange, open]
  )
  return (
    <PopoverContext.Provider value={{ open, disabled, setOpen, trigger, triggerKeyDown }}>
      <div
        {...props}
        style={sx(floatingRootStyle(), style)}
        onKeyDown={event => {
          onKeyDown?.(event)
          if (
            !event.defaultPrevented &&
            trigger.current &&
            renderer?.getFocusedElementId?.() === trigger.current.id
          )
            triggerKeyDown.current?.(event)
        }}
      >
        <div style={floatingRootStyle()}>{children}</div>
      </div>
    </PopoverContext.Provider>
  )
}

export function PopoverTrigger({
  asChild = false,
  disabled = false,
  children,
  onClick,
  onKeyDown,
  style,
  ref,
  ...props
}: PopoverTriggerProps) {
  const popover = usePopover()
  const theme = useTheme()
  const childDisabled =
    asChild && isValidElement<{ disabled?: unknown }>(children) && children.props.disabled === true
  const unavailable = disabled || popover.disabled || childDisabled
  const lastActivation = useRef<EventPayload | null>(null)
  const bindRef = useCallback(
    (instance: PublicInstance | null) => {
      popover.trigger.current = instance
      setRefs(instance, ref)
    },
    [popover.trigger, ref]
  )
  useLayoutEffect(() => {
    const handler = (event: KeyEvent) => {
      if (unavailable) return
      const key = event.key?.toLowerCase()
      if (key === "enter") {
        if (lastActivation.current === event) return
        lastActivation.current = event
        popover.setOpen(!popover.open)
        consumeKey(event, "handled")
      } else if ((key === "escape" || key === "esc") && popover.open) {
        popover.setOpen(false)
        consumeKey(event, "handled")
      }
    }
    const owner = popover.triggerKeyDown
    owner.current = handler
    return () => {
      if (owner.current === handler) owner.current = null
    }
  }, [popover, unavailable])
  const slotProps = {
    ...props,
    role: props.role ?? "button",
    tabIndex: 0,
    disabled: unavailable,
    "aria-disabled": unavailable,
    "aria-haspopup": "dialog",
    "aria-expanded": popover.open,
    style: sx(
      {
        keyboardFocusDim: false,
        focusVisible: unavailable
          ? undefined
          : {
              outlineWidth: theme.design.shape.focusRingWidth,
              outlineColor: theme.colors.ring,
              outlineOffset: -theme.design.shape.focusRingWidth,
            },
      },
      style
    ),
    onClick: (event: EventPayload) => {
      if (unavailable) return
      onClick?.(event)
      if (lastActivation.current === event) return
      lastActivation.current = event
      popover.setOpen(!popover.open)
    },
    onKeyDown: (event: KeyEvent) => {
      if (!unavailable) onKeyDown?.(event)
    },
  } satisfies Props & {
    disabled: boolean
    "aria-disabled": boolean
    "aria-haspopup": string
    "aria-expanded": boolean
  }
  return renderSlot({ asChild, children, props: slotProps, ref: bindRef })
}

export function PopoverContent({
  children,
  side = "bottom",
  align = "center",
  alignOffset = 0,
  sideOffset: providedSideOffset,
  collisionPadding: providedCollisionPadding,
  onMouseDownOutside,
  onKeyDown,
  style,
  ref,
  ...props
}: PopoverContentProps) {
  const popover = usePopover()
  const theme = useTheme()
  const sideOffset = providedSideOffset ?? theme.design.overlay.sideOffset
  const collisionPadding = providedCollisionPadding ?? theme.design.overlay.collisionPadding
  const { renderer } = useGpuix()
  const viewport = useWindowSize()
  const surface = useRef<PublicInstance | null>(null)
  const bindRef = useCallback(
    (instance: PublicInstance | null) => {
      surface.current = instance
      setRefs(instance, ref)
    },
    [ref]
  )
  useLayoutEffect(() => {
    if (popover.open && surface.current) renderer?.focusElement?.(surface.current.id)
  }, [popover.open, renderer])
  const maxWidth = Math.max(0, viewport.width - collisionPadding * 2)
  const maxHeight = Math.max(0, viewport.height - collisionPadding * 2)
  const surfaceStyle = sx(
    {
      display: "flex",
      flexDirection: "column",
      gap: theme.design.popover.gap,
      width: theme.design.popover.width,
      padding: theme.design.popover.inset,
      borderWidth: theme.design.popover.borderWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.design.popover.radius,
      color: theme.colors.popoverForeground,
      backgroundColor: theme.colors.popover,
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
  if (!popover.open) return null
  return (
    <FloatingLayer
      {...props}
      ref={bindRef}
      role={props.role ?? "dialog"}
      tabIndex={0}
      aria-disabled={false}
      side={side}
      align={align}
      alignOffset={alignOffset}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      style={surfaceStyle}
      onMouseDownOutside={event => {
        const trigger = popover.trigger.current
        const bounds = trigger ? renderer?.getElementBounds?.(trigger.id) : null
        if (
          bounds &&
          event.x !== undefined &&
          event.y !== undefined &&
          event.x >= bounds.x &&
          event.x <= bounds.x + bounds.width &&
          event.y >= bounds.y &&
          event.y <= bounds.y + bounds.height
        )
          return
        onMouseDownOutside?.(event)
        popover.setOpen(false)
      }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (event.key?.toLowerCase() === "escape" || event.key?.toLowerCase() === "esc") {
          popover.setOpen(false)
          if (popover.trigger.current) renderer?.focusElement?.(popover.trigger.current.id)
          consumeKey(event, "handled")
        }
      }}
    >
      {children}
    </FloatingLayer>
  )
}

export function PopoverHeader({ style, ...props }: PopoverHeaderProps) {
  const theme = useTheme()
  return (
    <div
      {...props}
      style={sx(
        {
          display: "flex",
          flexDirection: "column",
          gap: theme.design.popover.headerGap,
          whiteSpace: "normal",
        },
        style
      )}
    />
  )
}

export function PopoverTitle({ style, ...props }: PopoverTitleProps) {
  const theme = useTheme()
  return (
    <div
      {...props}
      role="heading"
      aria-level={props["aria-level"] ?? 2}
      style={sx(
        {
          fontSize: theme.control["--text-control-track"],
          fontWeight: theme.design.typography.weights.semibold,
          color: theme.colors.popoverForeground,
          whiteSpace: "normal",
        },
        style
      )}
    />
  )
}
