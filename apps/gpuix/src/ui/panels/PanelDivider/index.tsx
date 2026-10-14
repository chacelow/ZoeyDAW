import { usePanelGroup } from "../context"
import { Separator } from "../Separator"
import type { SeparatorProps } from "../Separator"

export interface PanelDividerProps extends SeparatorProps {
  orientation: "vertical" | "horizontal"
}

export function PanelDivider({ orientation, ...props }: PanelDividerProps) {
  const group = usePanelGroup()
  if ((orientation === "vertical") !== (group.orientation === "horizontal")) {
    throw new Error("PanelDivider orientation must be perpendicular to Group")
  }
  return <Separator {...props} />
}
