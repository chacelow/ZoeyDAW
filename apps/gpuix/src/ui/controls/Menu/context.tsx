import { floatingRootStyle } from "@gpuix/react/floating"
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { KeyEvent, PublicInstance } from "@gpuix/react"
import { sx } from "@/shared/theme/style"
import type { EntryEdge, MenuEntry, MenuProps, MenuState, Point } from "./model"

const MenuContext = createContext<MenuState | null>(null)
export const MenuActivityContext = createContext<(() => () => void) | null>(null)
export function useMenu(): MenuState {
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
  onKeyDown,
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
  const triggerKeyDown = useRef<((event: KeyEvent) => void) | null>(null)
  const entries = useRef(new Map<number, MenuEntry>()).current
  const ownSurfaces = useRef(new Map<number, PublicInstance>()).current
  const initialEdge = useRef<EntryEdge>("first")
  const activeChild = useRef<MenuState | null>(null)
  const open = !disabled && (controlledOpen ?? internalOpen) && (!parent || parent.open)
  const reportActivity = useContext(MenuActivityContext)
  useLayoutEffect(() => {
    if (open) return reportActivity?.()
  }, [open, reportActivity])
  const latest = useRef({ controlledOpen, disabled, onOpenChange, open })
  useLayoutEffect(() => {
    latest.current = { controlledOpen, disabled, onOpenChange, open }
  })
  const setOpen = useCallback((next: boolean) => {
    const current = latest.current
    if (current.disabled && next) return
    if (current.controlledOpen === undefined) setInternalOpen(next)
    if (next !== current.open) current.onOpenChange?.(next)
  }, [])
  const surfaces = parent?.surfaces ?? ownSurfaces
  const closeAll = useMemo(() => parent?.closeAll ?? (() => setOpen(false)), [parent, setOpen])
  const state = useMemo<MenuState>(
    () => ({
      open,
      disabled,
      contextMenu,
      parent,
      pointer,
      setPointer,
      setOpen,
      trigger,
      triggerKeyDown,
      entries,
      surfaces,
      initialEdge,
      activeChild,
      closeAll,
    }),
    [open, disabled, contextMenu, parent, pointer, setOpen, entries, surfaces, closeAll]
  )
  return (
    <MenuContext.Provider value={state}>
      <div
        {...props}
        style={sx(floatingRootStyle(), submenu && { width: "100%" }, style)}
        onKeyDown={event => {
          onKeyDown?.(event)
          if (!event.defaultPrevented) triggerKeyDown.current?.(event)
        }}
      >
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
