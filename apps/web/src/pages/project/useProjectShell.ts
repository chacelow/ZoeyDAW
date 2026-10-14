/**
 * useProjectShell — 项目视图的集中状态。
 *
 * - `activeSection`: 当前聚焦的 panel；点哪个 panel 就激活它，PanelShell 根据这个画高亮。
 * - 折叠态由 panel 内部的 `onResize` 回填，TransportBar 的开关按钮读它来显 outline；
 *   `toggleXxx` 直接 collapse/expand 对应 panel 句柄。
 */
import { useCallback, useRef, useState } from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import type { SectionId } from "./types"

export interface ProjectShellApi {
  activeSection: SectionId
  setActiveSection: (id: SectionId) => void

  browserCollapsed: boolean
  footerCollapsed: boolean
  setBrowserCollapsed: (v: boolean) => void
  setFooterCollapsed: (v: boolean) => void

  browserHandleRef: React.RefObject<PanelImperativeHandle | null>
  footerHandleRef: React.RefObject<PanelImperativeHandle | null>

  toggleBrowser: () => void
  toggleFooter: () => void
}

export function useProjectShell(): ProjectShellApi {
  const [activeSection, setActiveSection] = useState<SectionId>("arrangement")
  const [browserCollapsed, setBrowserCollapsed] = useState(false)
  const [footerCollapsed, setFooterCollapsed] = useState(false)

  const browserHandleReference = useRef<PanelImperativeHandle | null>(null)
  const footerHandleReference = useRef<PanelImperativeHandle | null>(null)

  const togglePanel = useCallback(
    (handle: PanelImperativeHandle | null, setCollapsed: (v: boolean) => void) => {
      if (!handle) {
        return
      }
      if (handle.isCollapsed()) {
        handle.expand()
        setCollapsed(false)
      } else {
        handle.collapse()
        setCollapsed(true)
      }
    },
    []
  )

  return {
    activeSection,
    setActiveSection,
    browserCollapsed,
    footerCollapsed,
    setBrowserCollapsed,
    setFooterCollapsed,
    browserHandleRef: browserHandleReference,
    footerHandleRef: footerHandleReference,
    toggleBrowser: () => togglePanel(browserHandleReference.current, setBrowserCollapsed),
    toggleFooter: () => togglePanel(footerHandleReference.current, setFooterCollapsed),
  }
}
