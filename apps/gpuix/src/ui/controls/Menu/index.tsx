import { useGpuix } from "@gpuix/react"
import { renderSlot, setRefs } from "@gpuix/react/floating"
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { EventPayload, KeyEvent, Props, PublicInstance } from "@gpuix/react"
import type { ReactNode } from "react"
import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { MenuSub, useMenu } from "./context"
import { MenuContent } from "./content"
import { finishSelection, focusEntry, isActivation, navigate } from "./navigation"
import { MenuTrigger } from "./trigger"
import { Icon } from "../Icon"
import { IconSlot } from "../IconSlot"
import { MenuRowContent, menuLabelChrome, menuRowChrome, menuSeparatorChrome } from "./row"
import type {
  MenuCheckboxItemProps,
  MenuContentProps,
  MenuGridPosition,
  MenuOptionGridProps,
  MenuOptionGridItemProps,
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
  MenuOption,
  MenuOptionGridProps,
  MenuOptionGridItemProps,
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
  shortcut,
  trailing,
  grid,
  swatch = false,
  ...props
}: MenuItemProps & {
  menuOverride?: MenuState
  activate?: (event: EventPayload) => void
  checked?: boolean
  asChild?: boolean
  trailing?: ReactNode
  grid?: MenuGridPosition
  swatch?: boolean
}) {
  const current = useMenu()
  const menu = menuOverride ?? current
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const { renderer } = useGpuix()
  const instance = useRef<PublicInstance | null>(null)
  const child = asChild && isValidElement<Props>(children) ? children : null
  const label = child ? child.props.children : children
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
    if (item) menu.entries.set(item.id, { instance: item, disabled: unavailable, grid })
  }, [menu.entries, unavailable, grid])
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
    "aria-label": props["aria-label"] ?? (typeof label === "string" ? label : undefined),
    disabled: unavailable,
    "aria-disabled": unavailable,
    "aria-checked": checked,
    style: sx(
      {
        ...menuRowChrome(theme),
        color: unavailable ? theme.colors.mutedForeground : theme.colors.popoverForeground,
        cursor: unavailable ? theme.design.cursors.default : theme.design.cursors.action,
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
      setHovered(true)
      if (unavailable) return
      onMouseEnter?.(event)
      if (instance.current) renderer?.focusElement?.(instance.current.id)
    },
    onMouseLeave: (event: EventPayload) => {
      setHovered(false)
      props.onMouseLeave?.(event)
    },
    onKeyDown: (event: KeyEvent) => {
      if (event.elementId !== instance.current?.id) return
      onKeyDown?.(event)
      if (navigate(menu, renderer, event)) return
      if (!unavailable && isActivation(event)) {
        consumeKey(event, "handled")
        select(event)
      }
    },
  } satisfies Props & {
    disabled: boolean
    "aria-disabled": boolean
    "aria-checked": boolean | undefined
  }
  const content = (
    <MenuRowContent
      hovered={hovered}
      checked={checked}
      shortcut={shortcut}
      trailing={trailing}
      swatch={swatch}
    >
      {label}
    </MenuRowContent>
  )
  return renderSlot({
    asChild,
    children: child ? cloneElement(child, { children: content }) : content,
    props: slotProps,
    ref: bindRef,
  })
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
      {children}
    </MenuItem>
  )
}

export const ContextMenuCheckboxItem = DropdownMenuCheckboxItem

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
      {children}
    </MenuItem>
  )
}

const OptionGridContext = createContext<{
  position: MenuGridPosition
  value: string
  onValueChange?: (value: string) => void
} | null>(null)

export function ContextMenuOptionGrid({
  columns,
  value,
  onValueChange,
  options,
  children,
  style,
  ...props
}: MenuOptionGridProps) {
  const group = useRef({})
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError("Menu option grid columns must be a positive integer")
  }
  const items = options
    ? options.map(option => (
        <ContextMenuOptionGridItem
          key={option.id}
          value={option.id}
          disabled={option.disabled}
          color={option.color}
        >
          {option.label}
        </ContextMenuOptionGridItem>
      ))
    : Children.toArray(children)
  const rows = []
  for (let start = 0; start < items.length; start += columns) {
    rows.push(
      <div key={start} style={{ display: "flex", flexDirection: "row", minWidth: 0 }}>
        {Array.from({ length: columns }, (_, offset) => {
          const index = start + offset
          return index < items.length ? (
            <OptionGridContext.Provider
              key={index}
              value={{ position: { group: group.current, index, columns }, value, onValueChange }}
            >
              {items[index]}
            </OptionGridContext.Provider>
          ) : (
            <div key={index} style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }} />
          )
        })}
      </div>
    )
  }
  return (
    <div {...props} role="group" style={sx({ display: "flex", flexDirection: "column" }, style)}>
      {rows}
    </div>
  )
}

export function ContextMenuOptionGridItem({
  value,
  color,
  children,
  style,
  onSelect,
  ...props
}: MenuOptionGridItemProps) {
  const grid = useContext(OptionGridContext)
  const theme = useTheme()
  if (!grid) throw new Error("ContextMenuOptionGridItem requires ContextMenuOptionGrid")
  const checked = grid.value === value
  return (
    <MenuItem
      {...props}
      role="menuitemradio"
      checked={checked}
      grid={grid.position}
      swatch={color !== undefined}
      style={sx(
        { flexGrow: 1, flexBasis: 0, minWidth: 0 },
        color !== undefined && {
          backgroundColor: color,
          outlineWidth: checked ? theme.design.menu.swatchRingWidth : 0,
          outlineColor: theme.colors.ring,
          outlineOffset: -theme.design.menu.swatchRingWidth,
          hover: { backgroundColor: color },
        },
        style
      )}
      onSelect={event => {
        if (!checked) grid.onValueChange?.(value)
        onSelect?.(event)
      }}
    >
      {children}
    </MenuItem>
  )
}

export const DropdownMenuOptionGrid = ContextMenuOptionGrid
export const DropdownMenuOptionGridItem = ContextMenuOptionGridItem

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
      trailing={
        <IconSlot>
          <Icon name="ChevronRight" />
        </IconSlot>
      }
      aria-haspopup="menu"
      aria-expanded={childMenu.open}
      onMouseEnter={event => {
        onMouseEnter?.(event)
        open()
      }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (event.key?.toLowerCase() === "right" || event.key?.toLowerCase() === "arrowright") {
          consumeKey(event, "handled")
          open()
        }
      }}
    >
      {children}
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
          ...menuLabelChrome(theme),
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
          ...menuSeparatorChrome(theme),
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
export type ContextMenuOptionGridProps = MenuOptionGridProps
export type DropdownMenuOptionGridProps = MenuOptionGridProps
export type ContextMenuOptionGridItemProps = MenuOptionGridItemProps
export type DropdownMenuOptionGridItemProps = MenuOptionGridItemProps
export type ContextMenuCheckboxItemProps = MenuCheckboxItemProps
