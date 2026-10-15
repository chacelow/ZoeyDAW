import type { EventPayload, Props, PublicInstance } from "@gpuix/react"
import type { FloatingContentProps } from "@gpuix/react/floating"
import type { RefObject } from "react"

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

export type Point = { x: number; y: number }
export type MenuEntry = { instance: PublicInstance; disabled: boolean }
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
  entries: Map<number, MenuEntry>
  surfaces: Map<number, PublicInstance>
  initialEdge: RefObject<EntryEdge>
  activeChild: RefObject<MenuState | null>
}
