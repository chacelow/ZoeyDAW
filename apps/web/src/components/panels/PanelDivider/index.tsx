/**
 * PanelDivider — react-resizable-panels v4 的 `<Separator />` 项目壳。
 *
 * - 底色 `bg-card`；7px token gap，cursor 变 `col-resize` / `row-resize` 即可提示拖动。
 *   之前中央 pill 和 collapsible panel 的 active `border-ring` 色系相近，视觉上
 *   会让 active border 看着像被 pill 截断，索性去掉。
 * - 显式 `z-0`，PanelShell active 的 `z-10` 永远在上。
 */
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
