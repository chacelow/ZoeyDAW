import { createContext, useContext } from "react"
import type { ResolvedConstraints } from "./layout/sizes"

export interface LayoutSnapshot {
  sizes: number[]
  total: number
  constraints: ResolvedConstraints[]
}

export interface GroupState extends LayoutSnapshot {
  orientation: "horizontal" | "vertical"
  resizePanel: (index: number, pixels: number) => void
  beginDrag: () => LayoutSnapshot
  preview: (snapshot: LayoutSnapshot, separator: number, delta: number) => void
  endDrag: (restore?: LayoutSnapshot) => void
}

export const GroupContext = createContext<GroupState | null>(null)
export const SlotContext = createContext(0)

export function usePanelGroup(): GroupState {
  const group = useContext(GroupContext)
  if (!group) throw new Error("Panel and Separator must be direct children of Group")
  return group
}
