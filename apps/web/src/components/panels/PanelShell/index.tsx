/**
 * PanelShell — DAW 项目视图里每张 Panel 卡片的通用外壳。
 *
 * 职责（且仅此）：
 *   1. 统一卡片样式：`bg-muted`、2px token 边框和 `rounded-md`。
 *   2. active 时切 `border-ring` 色，不使用会被裁掉的外沿 ring。
 *   3. 捕获 `onPointerDownCapture` 把 `id` 冒上去给调用方做 active 分发。
 *   4. 颜色与尺寸走 design token。
 *
 * 使用方自带 PanelShell<MyId> 的 generic：
 *
 *   <PanelShell id="browser" active={active} onActivate={setActive}>
 *     <BrowserPanel />
 *   </PanelShell>
 *
 * 关键约束（踩过）：
 *   - react-resizable-panels v4 的 Panel/Group 内置 `overflow: hidden` 不能覆盖。
 *     用外沿 `ring-*` / 外沿 `box-shadow` 会被兄弟或父级裁掉，视觉上出现"三边 ring + 一边断"
 *     的方框残影。保持单纯 token 边框变色是最稳的方案。
 *   - 不要在 PanelShell 内部另加 bg 变化、padding，交给内部 section 组件处理。
 */
import { cn } from "@zoeymind/ui"
import type { ReactNode } from "react"

export interface PanelShellProps<Id extends string> {
  readonly id: Id
  readonly active: Id
  readonly onActivate: (id: Id) => void
  readonly className?: string
  readonly children: ReactNode
}

export function PanelShell<Id extends string>({
  id,
  active,
  onActivate,
  className,
  children,
}: PanelShellProps<Id>) {
  const isActive = active === id
  return (
    <div
      onPointerDownCapture={() => onActivate(id)}
      className={cn(
        "bg-muted relative flex h-full flex-col overflow-hidden rounded-md border-[length:var(--project-panel-border)]",
        isActive ? "border-ring z-10" : "border-border",
        className
      )}
    >
      {children}
    </div>
  )
}
