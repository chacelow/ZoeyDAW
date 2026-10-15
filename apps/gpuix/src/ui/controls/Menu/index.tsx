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
import type { EventPayload, KeyEvent, NativeRenderer, Props, PublicInstance } from "@gpuix/react"
import type { FloatingContentProps } from "@gpuix/react/floating"
import type { ReactNode, RefObject } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { readOuterBounds } from "../useMeasuredTextWidth"

export interface MenuProps extends Props {
  open?: boolean
  defaultOpen?: boolean
  disabled?: boolean
  onOpenChange?: (open: boolean) => void
}

export interface MenuTriggerProps extends Props {
  asChild?: boolean
  disabled?: boolean
}

export type MenuContentProps = FloatingContentProps

export interface MenuItemProps extends Props {
  disabled?: boolean
  inset?: boolean
  onSelect?: (event: EventPayload) => void
}

export interface MenuCheckboxItemProps extends MenuItemProps {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

export interface MenuRadioGroupProps extends Props {
  value: string
  onValueChange?: (value: string) => void
}

export interface MenuRadioItemProps extends MenuItemProps {
  value: string
}

export interface MenuSubTriggerProps extends MenuItemProps {
  asChild?: boolean
}

type Point = { x: number; y: number }
type MenuEntry = { instance: PublicInstance; disabled: boolean }
type EntryEdge = "first" | "last"

interface MenuState {
  open: boolean
  disabled: boolean
  contextMenu: boolean
  parent: MenuState | null
  pointer: Point | null
  setPointer: (point: Point | null) => void
  setOpen: (open: boolean) => void
  closeAll: () => void
  trigger: RefObject<PublicInstance | null>
  entries: Map<number, MenuEntry>
  surfaces: Map<number, PublicInstance>
  initialEdge: RefObject<EntryEdge>
  activeChild: RefObject<MenuState | null>
}

const MenuContext = createContext<MenuState | null>(null)
const RadioContext = createContext<Pick<MenuRadioGroupProps, "value" | "onValueChange"> | null>(
  null
)

function useMenu(): MenuState {
  const menu = useContext(MenuContext)
  if (!menu) throw new Error("Menu components require a menu root")
  return menu
}

function MenuRoot({
  open: controlledOpen,
  defaultOpen = false,
  disabled = false,
  onOpenChange,
  children,
  style,
  contextMenu,
  submenu = false,
  ...props
}: MenuProps & { contextMenu: boolean; submenu?: boolean }) {
  const ancestor = useContext(MenuContext)
  const parent = submenu ? ancestor : null
  if (submenu && !parent) throw new Error("MenuSub requires a parent menu")
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const [pointer, setPointer] = useState<Point | null>(null)
  const trigger = useRef<PublicInstance | null>(null)
  const entries = useRef(new Map<number, MenuEntry>()).current
  const ownSurfaces = useRef(new Map<number, PublicInstance>()).current
  const initialEdge = useRef<EntryEdge>("first")
  const activeChild = useRef<MenuState | null>(null)
  const open = !disabled && (controlledOpen ?? internalOpen) && (!parent || parent.open)
  const setOpen = useCallback(
    (next: boolean) => {
      if (disabled && next) return
      if (controlledOpen === undefined) setInternalOpen(next)
      if (next !== open) onOpenChange?.(next)
    },
    [controlledOpen, disabled, onOpenChange, open]
  )
  const state: MenuState = {
    open,
    disabled,
    contextMenu,
    parent,
    pointer,
    setPointer,
    setOpen,
    trigger,
    entries,
    surfaces: parent?.surfaces ?? ownSurfaces,
    initialEdge,
    activeChild,
    closeAll: parent?.closeAll ?? (() => setOpen(false)),
  }
  return (
    <MenuContext.Provider value={state}>
      <div {...props} style={sx(floatingRootStyle(), submenu && { width: "100%" }, style)}>
        <div style={sx(floatingRootStyle(), submenu && { width: "100%" })}>{children}</div>
      </div>
    </MenuContext.Provider>
  )
}

export function ContextMenu(props: MenuProps) {
  return <MenuRoot {...props} contextMenu />
}

export function DropdownMenu(props: MenuProps) {
  return <MenuRoot {...props} contextMenu={false} />
}

export function MenuSub(props: MenuProps) {
  const menu = useMenu()
  return <MenuRoot {...props} contextMenu={menu.contextMenu} submenu />
}

function focusEntry(
  entries: Map<number, MenuEntry>,
  renderer: NativeRenderer | null,
  edge: EntryEdge
) {
  const enabled = [...entries.values()].filter(entry => !entry.disabled)
  const entry = edge === "first" ? enabled[0] : enabled.at(-1)
  if (entry) {
    renderer?.focusElement?.(entry.instance.id)
    entry.instance.scrollIntoView?.()
    return true
  }
  return false
}

function navigate(menu: MenuState, renderer: NativeRenderer | null, event: EventPayload): boolean {
  const key = event.key?.toLowerCase()
  const activeChild = menu.activeChild.current
  if (
    activeChild?.open &&
    (key === "escape" || key === "esc" || key === "left" || key === "arrowleft")
  )
    return navigate(activeChild, renderer, event)
  if (
    key === "escape" ||
    key === "esc" ||
    (menu.parent && (key === "left" || key === "arrowleft"))
  ) {
    menu.setOpen(false)
    if (menu.trigger.current) renderer?.focusElement?.(menu.trigger.current.id)
    return true
  }
  if (key === "tab") {
    menu.closeAll()
    return true
  }
  if (key === "home" || key === "end") {
    focusEntry(menu.entries, renderer, key === "home" ? "first" : "last")
    return true
  }
  const direction =
    key === "down" || key === "arrowdown" ? 1 : key === "up" || key === "arrowup" ? -1 : 0
  if (!direction) return false
  const enabled = [...menu.entries.values()].filter(entry => !entry.disabled)
  const index = enabled.findIndex(entry => entry.instance.id === event.elementId)
  const next =
    index === -1
      ? direction > 0
        ? 0
        : enabled.length - 1
      : (index + direction + enabled.length) % enabled.length
  const entry = enabled[next]
  if (entry) {
    renderer?.focusElement?.(entry.instance.id)
    entry.instance.scrollIntoView?.()
  }
  return true
}

function isActivation(event: EventPayload) {
  const key = event.key?.toLowerCase()
  return key === "enter" || key === "space" || key === " "
}

function MenuTrigger({
  asChild = false,
  disabled = false,
  children,
  onClick,
  onMouseDown,
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
      if (menu.contextMenu && (event.button === 2 || event.isRightClick || event.modifiers?.ctrl)) {
        menu.setPointer(
          event.x !== undefined && event.y !== undefined ? { x: event.x, y: event.y } : null
        )
        menu.setOpen(true)
      }
    },
    onClick: (event: EventPayload) => {
      if (unavailable) return
      onClick?.(event)
      if (lastActivation.current === event) return
      lastActivation.current = event
      if (!menu.contextMenu) menu.setOpen(!menu.open)
    },
    onKeyDown: (event: KeyEvent) => {
      if (unavailable) return
      onKeyDown?.(event)
      const key = event.key?.toLowerCase()
      if (
        (!menu.contextMenu &&
          (isActivation(event) ||
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
        menu.setOpen(isActivation(event) ? !menu.open : true)
        if (menu.open && !isActivation(event))
          focusEntry(menu.entries, renderer, menu.initialEdge.current)
      } else if (key === "escape" || key === "esc") {
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

export const ContextMenuTrigger = MenuTrigger
export const DropdownMenuTrigger = MenuTrigger

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

function MenuContent({
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
    else menu.closeAll()
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
        gap: 6,
        minWidth: 0,
        minHeight: theme.control["--spacing-control-track"],
        flexShrink: 0,
        fontSize: theme.control["--text-control-track"],
        paddingLeft: inset ? theme.control["--spacing-control-icon"] + 12 : 6,
        paddingRight: 6,
        paddingTop: 2,
        paddingBottom: 2,
        borderRadius: 2,
        whiteSpace: "normal",
        color: unavailable ? theme.colors.mutedForeground : theme.colors.popoverForeground,
        cursor: unavailable ? "default" : "pointer",
        hover: unavailable ? undefined : { backgroundColor: theme.colors.accent },
        keyboardFocusDim: false,
        focusVisible: unavailable
          ? undefined
          : { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
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
      if (!unavailable && isActivation(event)) select(event)
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
          padding: 6,
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
