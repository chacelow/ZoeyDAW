/**
 * IconSlot — DAW 控件内嵌 icon 的统一槽位。
 *
 * 颜色继承父 chrome 的 `currentColor` → 控件进入 active(`bg-primary` +
 * `text-primary-foreground`)时图标自动跟翻,不需要每个 variant 手工对接。
 *
 * 外壳 `size-6`,内层 svg 填满槽位。
 */
import { cn } from "#lib/utils"
import type { ReactNode } from "react"

export function IconSlot({
  children,
  className,
  size = "default",
}: {
  readonly children: ReactNode
  readonly className?: string
  readonly size?: "default" | "compact"
}) {
  return (
    <span
      aria-hidden
      className={cn(
        size === "compact"
          ? "size-control-icon-compact [&>svg]:size-control-icon-compact"
          : "size-control-icon-slot [&>svg]:size-control-icon",
        "flex shrink-0 items-center justify-center text-current [&>svg]:text-current",
        className
      )}
    >
      {children}
    </span>
  )
}
