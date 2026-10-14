/**
 * VisuallyHidden — 屏幕阅读器可见, 视觉不可见.
 *
 * Base UI 生态无对应原语 (shadcn skill display-misc: VisuallyHidden -> sr-only).
 * Tailwind 的 `sr-only` class 已经是官方推荐做法; 保留组件外壳给消费方无缝迁移.
 */
import { cn } from "#lib/utils"
import type { ComponentProps } from "react"

function VisuallyHidden({ className, ...properties }: ComponentProps<"span">) {
  return <span className={cn("sr-only", className)} {...properties} />
}

export { VisuallyHidden }
