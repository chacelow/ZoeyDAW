import type { EventPayload, KeyEvent, Props, PublicInstance } from "@gpuix/react"
import type { FloatingContentProps } from "@gpuix/react/floating"
import type { ReactNode, RefObject } from "react"

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
  shortcut?: string
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

export interface MenuOption {
  id: string
  label: string
  disabled?: boolean
  color?: string
}

export type MenuOptionGridProps = Omit<Props, "children"> & {
  columns: number
  value: string
  onValueChange?: (value: string) => void
} & (
  | { options: readonly MenuOption[]; children?: never }
  | { options?: never; children: ReactNode }
)

export interface MenuOptionGridItemProps extends MenuRadioItemProps {
  color?: string
}

export interface MenuGridPosition {
  group: object
  index: number
  columns: number
}

export type Point = { x: number; y: number }
export type MenuEntry = {
  instance: PublicInstance
  disabled: boolean
  grid?: MenuGridPosition
}
export type EntryEdge = "first" | "last"

export interface MenuState {
  open: boolean
  disabled: boolean
  contextMenu: boolean
  parent: MenuState | null
  pointer: Point | null
  setPointer: (point: Point | null) => void
  setOpen: (open: boolean) => void
  closeAll: () => void
  trigger: RefObject<PublicInstance | null>
  triggerKeyDown: RefObject<((event: KeyEvent) => void) | null>
  entries: Map<number, MenuEntry>
  surfaces: Map<number, PublicInstance>
  initialEdge: RefObject<EntryEdge>
  activeChild: RefObject<MenuState | null>
}
