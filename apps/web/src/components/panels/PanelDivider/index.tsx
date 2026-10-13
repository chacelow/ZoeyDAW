/**
 * PanelDivider — react-resizable-panels v4 的 `<Separator />` 项目壳。
 *
 * - 底色 `bg-muted`，和 chrome（titlebar / transport / status）同色。
 * - 7px gap；cursor 变 `col-resize` / `row-resize` 已足够提示可拖，不再画抓手 pill。
 *   之前中央 pill 和 collapsible panel 的 active `border-ring` 色系相近，视觉上
 *   会让 active border 看着像被 pill 截断，索性去掉。
 * - 显式 `z-0`，PanelShell active 的 `z-10` 永远在上。
 */
import {
  Separator as RrpSeparator,
  type SeparatorProps as RrpSeparatorProps,
} from "react-resizable-panels"
import { cn } from "@zoeymind/ui"

export interface PanelDividerProps extends Omit<RrpSeparatorProps, "className"> {
  orientation: "vertical" | "horizontal"
  className?: string
}

export function PanelDivider({ orientation, className, ...rest }: PanelDividerProps) {
  const vertical = orientation === "vertical"
  return (
    <RrpSeparator
      {...rest}
      className={cn(
        "relative z-0 bg-card",
        vertical ? "w-[7px] cursor-col-resize" : "h-[7px] cursor-row-resize",
        className
      )}
    />
  )
}
