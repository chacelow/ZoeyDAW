import { Separator as RrpSeparator } from "react-resizable-panels"
import { cn } from "@zoeymind/ui"
import type { SeparatorProps as RrpSeparatorProperties } from "react-resizable-panels"

export interface PanelDividerProps extends Omit<RrpSeparatorProperties, "className"> {
  readonly orientation: "vertical" | "horizontal"
  readonly className?: string
}

export function PanelDivider({ orientation, className, ...rest }: PanelDividerProps) {
  const isVertical = orientation === "vertical"
  return (
    <RrpSeparator
      {...rest}
      className={cn(
        "bg-card relative z-0",
        isVertical
          ? "w-[var(--project-panel-gap)] cursor-col-resize"
          : "h-[var(--project-panel-gap)] cursor-row-resize",
        className
      )}
    />
  )
}
