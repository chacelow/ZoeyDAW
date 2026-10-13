/**
 * PanelShell — DAW 项目视图里每张 Panel 卡片的通用外壳。
 *
 * 职责（且仅此）：
 *   1. 统一卡片样式：`bg-card` + `border-border` + `rounded-md`。
 *   2. active 时切 `border-ring` 色（整条 1px 外框变主色，无 ring 伪影，无层级冲突）。
 *   3. 捕获 `onPointerDownCapture` 把 `id` 冒上去给调用方做 active 分发。
 *   4. 颜色全部走 design token（无硬编码）。
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
 *     的方框残影。保持单纯 1px border 变色是最稳的方案。
 *   - 不要在 PanelShell 内部加 bg 变化、padding，交给内部 section 组件处理。
 */
import { type ReactNode } from "react"
import { cn } from "@zoeymind/ui"

export interface PanelShellProps<Id extends string> {
  id: Id
  active: Id
  onActivate: (id: Id) => void
  className?: string
  children: ReactNode
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
        "relative flex h-full flex-col overflow-hidden rounded-md border-2 bg-muted",
        isActive ? "z-10 border-ring" : "border-border",
        className
      )}
    >
      {children}
    </div>
  )
}
