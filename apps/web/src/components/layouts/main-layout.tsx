import { Outlet } from "react-router-dom"
import type { ReactNode } from "react"

/**
 * 顶层布局:
 *   - 固定顶部 64px(h-16)TitleBar(Tauri Overlay 样式;含拖拽 + 系统按钮)
 *   - 主内容 `pt-16` 紧贴 titlebar,无额外 gap
 */
export function MainLayout({ titleBar }: { readonly titleBar: ReactNode }) {
  return (
    <div className="bg-background flex h-screen flex-col">
      {titleBar}
      <main className="min-h-0 flex-1 overflow-hidden pt-16">
        <Outlet />
      </main>
    </div>
  )
}
