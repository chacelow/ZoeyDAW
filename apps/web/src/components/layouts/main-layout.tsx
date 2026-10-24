import { Outlet } from "react-router-dom"
import type { ReactNode } from "react"

export function MainLayout({ titleBar }: { readonly titleBar: ReactNode }) {
  return (
    <div className="bg-card flex h-screen flex-col">
      {titleBar}
      <main className="app-main-content min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
