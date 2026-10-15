import { useGpuix } from "@gpuix/react"
import { renderSlot, setRefs } from "@gpuix/react/floating"
import {
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
} from "react"
import type { EventPayload, KeyEvent, Props, PublicInstance } from "@gpuix/react"
import type { ReactNode } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { MenuSub, useMenu } from "./context"
import { MenuContent } from "./content"
import { finishSelection, focusEntry, isActivation, navigate } from "./navigation"
import { MenuTrigger } from "./trigger"
import type {
  MenuCheckboxItemProps,
  MenuContentProps,
  MenuItemProps,
  MenuProps,
  MenuRadioGroupProps,
  MenuRadioItemProps,
  MenuState,
  MenuSubTriggerProps,
  MenuTriggerProps,
} from "./model"

export { ContextMenu, DropdownMenu, MenuSub } from "./context"
export type {
  MenuCheckboxItemProps,
  MenuContentProps,
  MenuItemProps,
  MenuProps,
  MenuRadioGroupProps,
  MenuRadioItemProps,
  MenuSubTriggerProps,
  MenuTriggerProps,
} from "./model"

const RadioContext = createContext<Pick<MenuRadioGroupProps, "value" | "onValueChange"> | null>(
  null
)

export const ContextMenuTrigger = MenuTrigger
export const DropdownMenuTrigger = MenuTrigger

export const ContextMenuContent = MenuContent
export const DropdownMenuContent = MenuContent
export const ContextMenuSubContent = MenuContent
export const DropdownMenuSubContent = MenuContent
export const ContextMenuSub = MenuSub
export const DropdownMenuSub = MenuSub

function MenuItem({
  disabled = false,
  inset = false,
  asChild = false,
  children,
  onSelect,
  onClick,
  onKeyDown,
  onMouseEnter,
  style,
  ref,
  menuOverride,
  activate,
  role = "menuitem",
  checked,
  ...props
}: MenuItemProps & {
  menuOverride?: MenuState
  activate?: (event: EventPayload) => void
  checked?: boolean
  asChild?: boolean
}) {
  const current = useMenu()
  const menu = menuOverride ?? current
  const theme = useTheme()
  const { renderer } = useGpuix()
  const instance = useRef<PublicInstance | null>(null)
  const childDisabled =
    asChild && isValidElement<{ disabled?: unknown }>(children) && children.props.disabled === true
  const unavailable = disabled || menu.disabled || childDisabled
  const lastActivation = useRef<EventPayload | null>(null)
  const bindRef = useCallback(
    (next: PublicInstance | null) => {
      instance.current = next
      setRefs(next, ref)
    },
    [ref]
  )
  useLayoutEffect(() => {
    const item = instance.current
    if (!item) return
    return () => {
      menu.entries.delete(item.id)
    }
  }, [menu.entries])
  useLayoutEffect(() => {
    const item = instance.current
    if (item) menu.entries.set(item.id, { instance: item, disabled: unavailable })
  }, [menu.entries, unavailable])
  const select = (event: EventPayload) => {
    if (unavailable || lastActivation.current === event) return
    lastActivation.current = event
    onSelect?.(event)
    onClick?.(event)
    if (activate) activate(event)
    else finishSelection(menu, renderer)
  }
  const slotProps = {
    ...props,
    role,
    tabIndex: 0,
    "aria-label": props["aria-label"] ?? (typeof children === "string" ? children : undefined),
    disabled: unavailable,
    "aria-disabled": unavailable,
    "aria-checked": checked,
    style: sx(
      {
        display: "flex",
        alignItems: "center",
        gap: theme.design.menu.itemGap,
        minWidth: 0,
        minHeight: theme.control["--spacing-control-track"],
        flexShrink: 0,
        fontSize: theme.control["--text-control-track"],
        paddingLeft: inset
          ? theme.control["--spacing-control-icon"] +
            theme.design.menu.itemPaddingInline +
            theme.design.menu.itemGap
          : theme.design.menu.itemPaddingInline,
        paddingRight: theme.design.menu.itemPaddingInline,
        paddingTop: theme.design.menu.itemPaddingBlock,
        paddingBottom: theme.design.menu.itemPaddingBlock,
        borderRadius: theme.design.menu.itemRadius,
        whiteSpace: "normal",
        color: unavailable ? theme.colors.mutedForeground : theme.colors.popoverForeground,
        cursor: unavailable ? "default" : "pointer",
        hover: unavailable ? undefined : { backgroundColor: theme.colors.accent },
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
    onClick: select,
    onMouseEnter: (event: EventPayload) => {
      if (unavailable) return
      onMouseEnter?.(event)
      if (instance.current) renderer?.focusElement?.(instance.current.id)
    },
    onKeyDown: (event: KeyEvent) => {
      if (event.elementId !== instance.current?.id) return
      onKeyDown?.(event)
      if (navigate(menu, renderer, event)) return
      if (!unavailable && isActivation(event)) {
        event.preventDefault()
        event.stopPropagation()
        select(event)
      }
    },
  } satisfies Props & {
    disabled: boolean
    "aria-disabled": boolean
    "aria-checked": boolean | undefined
  }
  return renderSlot({ asChild, children, props: slotProps, ref: bindRef })
}

export function ContextMenuItem(props: MenuItemProps) {
  return <MenuItem {...props} />
}

export const DropdownMenuItem = ContextMenuItem

export function DropdownMenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
  onSelect,
  ...props
}: MenuCheckboxItemProps) {
  const theme = useTheme()
  return (
    <MenuItem
      {...props}
      role="menuitemcheckbox"
      aria-label={props["aria-label"] ?? (typeof children === "string" ? children : undefined)}
      checked={checked}
      onSelect={event => {
        onCheckedChange?.(!checked)
        onSelect?.(event)
      }}
    >
      <div aria-hidden style={{ width: theme.control["--spacing-control-icon"], flexShrink: 0 }}>
        {checked ? "✓" : ""}
      </div>
      {children}
    </MenuItem>
  )
}

export function ContextMenuRadioGroup({
  value,
  onValueChange,
  children,
  ...props
}: MenuRadioGroupProps) {
  return (
    <RadioContext.Provider value={{ value, onValueChange }}>
      <div
        {...props}
        role="group"
        style={sx({ display: "flex", flexDirection: "column" }, props.style)}
      >
        {children}
      </div>
    </RadioContext.Provider>
  )
}

export function ContextMenuRadioItem({ value, children, onSelect, ...props }: MenuRadioItemProps) {
  const radio = useContext(RadioContext)
  const theme = useTheme()
  if (!radio) throw new Error("ContextMenuRadioItem requires ContextMenuRadioGroup")
  const checked = radio.value === value
  return (
    <MenuItem
      {...props}
      role="menuitemradio"
      aria-label={props["aria-label"] ?? (typeof children === "string" ? children : undefined)}
      checked={checked}
      onSelect={event => {
        if (radio.value !== value) radio.onValueChange?.(value)
        onSelect?.(event)
      }}
    >
      <div aria-hidden style={{ width: theme.control["--spacing-control-icon"], flexShrink: 0 }}>
        {checked ? "●" : ""}
      </div>
      {children}
    </MenuItem>
  )
}

function SubTrigger({
  children,
  disabled,
  onKeyDown,
  onMouseEnter,
  ref,
  asChild = false,
  ...props
}: MenuSubTriggerProps) {
  const childMenu = useMenu()
  const parent = childMenu.parent
  if (!parent) throw new Error("SubTrigger requires MenuSub")
  const { renderer } = useGpuix()
  const open = () => {
    if (disabled || childMenu.disabled) return
    const sibling = parent.activeChild.current
    if (sibling && sibling.trigger !== childMenu.trigger) sibling.setOpen(false)
    childMenu.initialEdge.current = "first"
    childMenu.setOpen(true)
    if (childMenu.open) focusEntry(childMenu.entries, renderer, "first")
  }
  const bindRef = useCallback(
    (instance: PublicInstance | null) => {
      childMenu.trigger.current = instance
      setRefs(instance, ref)
    },
    [childMenu.trigger, ref]
  )
  const content = asChild ? (
    children
  ) : (
    <>
      {children}
      <div aria-hidden="true" style={{ flexGrow: 1 }} />
      <text aria-hidden="true">›</text>
    </>
  )
  return (
    <MenuItem
      {...props}
      aria-label={props["aria-label"] ?? (typeof children === "string" ? children : undefined)}
      style={sx({ width: "100%" }, props.style)}
      asChild={asChild}
      ref={bindRef}
      disabled={disabled || childMenu.disabled}
      menuOverride={parent}
      activate={open}
      aria-haspopup="menu"
      aria-expanded={childMenu.open}
      onMouseEnter={event => {
        onMouseEnter?.(event)
        open()
      }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (event.key?.toLowerCase() === "right" || event.key?.toLowerCase() === "arrowright")
          open()
      }}
    >
      {content}
    </MenuItem>
  )
}

export const ContextMenuSubTrigger = SubTrigger
export const DropdownMenuSubTrigger = SubTrigger

export function ContextMenuLabel({ style, ...props }: Props) {
  const theme = useTheme()
  return (
    <div
      {...props}
      style={sx(
        {
          padding: theme.design.menu.labelInset,
          color: theme.colors.mutedForeground,
          fontSize: theme.control["--text-control-track"],
          whiteSpace: "normal",
        },
        style
      )}
    />
  )
}

export function ContextMenuSeparator({ style, ...props }: Props) {
  const theme = useTheme()
  return (
    <div
      {...props}
      role="separator"
      style={sx(
        {
          height: 1,
          flexShrink: 0,
          marginTop: 4,
          marginBottom: 4,
          backgroundColor: theme.colors.border,
        },
        style
      )}
    />
  )
}

export const DropdownMenuLabel = ContextMenuLabel
export const DropdownMenuSeparator = ContextMenuSeparator

export function DropdownMenuPortal({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

export type ContextMenuProps = MenuProps
export type DropdownMenuProps = MenuProps
export type ContextMenuTriggerProps = MenuTriggerProps
export type DropdownMenuTriggerProps = MenuTriggerProps
export type ContextMenuContentProps = MenuContentProps
export type DropdownMenuContentProps = MenuContentProps
export type ContextMenuItemProps = MenuItemProps
export type DropdownMenuItemProps = MenuItemProps
export type DropdownMenuCheckboxItemProps = MenuCheckboxItemProps
export type ContextMenuRadioGroupProps = MenuRadioGroupProps
export type ContextMenuRadioItemProps = MenuRadioItemProps
export type ContextMenuSubProps = MenuProps
export type DropdownMenuSubProps = MenuProps
export type ContextMenuSubTriggerProps = MenuSubTriggerProps
export type DropdownMenuSubTriggerProps = MenuSubTriggerProps
export type ContextMenuSubContentProps = MenuContentProps
export type DropdownMenuSubContentProps = MenuContentProps
export type ContextMenuLabelProps = Props
export type ContextMenuSeparatorProps = Props
export type DropdownMenuLabelProps = Props
export type DropdownMenuSeparatorProps = Props
export type DropdownMenuPortalProps = { children?: ReactNode }
