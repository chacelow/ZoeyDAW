import { useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { projectActions, useProjectState } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { activateTab, addPanel, findBorder, getBorderTabs, getGroups, hideTab, selectBorderTab, splitGroup, toggleBorderVisible } from "@/ui/panels"
import type { DockLayoutHandle, DockLayoutJSON } from "@/ui/panels"
import type { FooterView } from "@/project/sections/footer"
import { restoreProjectWorkspace } from "./project-workspace"

export interface ProjectShellApi {
  readonly layout: DockLayoutJSON
  readonly dockRef: React.RefObject<DockLayoutHandle | null>
  readonly dockFocused: React.RefObject<boolean>
  readonly browserCollapsed: boolean
  readonly footerCollapsed: boolean
  readonly setLayout: (layout: DockLayoutJSON) => void
  readonly toggleBrowser: () => void
  readonly toggleFooter: () => void
  readonly setFooterCollapsed: (collapsed: boolean) => void
  readonly selectFooterView: (view: FooterView) => void
}

export function useProjectShell(): ProjectShellApi {
  const { design } = useTheme()
  const json = useProjectState(state => state.workspace.dockLayout)
  const editEpoch = useProjectState(state => state.session.editEpoch)
  const layout = useMemo(() => restoreProjectWorkspace(json, design.dock.borderSize), [json, design.dock.borderSize])
  const current = useRef(layout)
  current.current = layout
  const dockRef = useRef<DockLayoutHandle | null>(null)
  const dockFocused = useRef(false)
  const setLayout = useCallback((next: DockLayoutJSON) => {
    if (useProjectState.getState().session.editEpoch !== editEpoch) return
    current.current = next
    projectActions.setDockLayout(JSON.stringify(next))
  }, [editEpoch])
  const groups = getGroups(layout.root)
  const editorGroup = groups.find(group => group.tabs.includes("clipEditor") || group.tabs.includes("devices"))
  const borderTabs = getBorderTabs(layout)
  const browserBorder = findBorder(layout, "browser")
  const footerBorder = findBorder(layout, "clipEditor") ?? findBorder(layout, "devices")
  const footerCollapsed = footerBorder ? !layout.borders[footerBorder]?.selected || layout.borders[footerBorder]?.visible === false : !editorGroup && !borderTabs.some(id => id === "clipEditor" || id === "devices")
  const selectFooterView = useCallback((view: FooterView) => {
    const id = view === "clip" ? "clipEditor" : "devices"
    const side = findBorder(current.current, id)
    if (side) {
      const next = selectBorderTab(current.current, side, id)
      setLayout(next.borders[side]?.visible === false ? toggleBorderVisible(next, side) : next)
      return
    }
    const target = getGroups(current.current.root).find(group => group.tabs.includes("clipEditor") || group.tabs.includes("devices"))
    if (target) setLayout({ ...activateTab(addPanel(current.current, id, target.id), id), maximizedGroup: null })
    else {
      const arrangement = getGroups(current.current.root).find(group => group.tabs.includes("arrangement"))
      const next = { ...addPanel(current.current, id, arrangement?.id), maximizedGroup: null }
      setLayout(arrangement ? splitGroup(next, id, arrangement.id, "bottom") : next)
    }
  }, [setLayout])
  const setFooterCollapsed = useCallback((collapsed: boolean) => {
    const side = findBorder(current.current, "clipEditor") ?? findBorder(current.current, "devices")
    if (collapsed && side) setLayout(selectBorderTab(current.current, side, null))
    else if (collapsed) setLayout(hideTab(hideTab(current.current, "clipEditor"), "devices"))
    else selectFooterView("clip")
  }, [setLayout, selectFooterView])
  const editorRequest = useProjectState(state => state.session.clipEditorRequest)
  const editingClipId = useProjectState(state => state.session.editingClipId)
  const editing = useRef(editingClipId)
  editing.current = editingClipId
  const handledRequest = useRef(editorRequest)
  useLayoutEffect(() => {
    if (editorRequest === handledRequest.current) return
    handledRequest.current = editorRequest
    if (editorRequest === 0) return
    if (editing.current !== null) selectFooterView("clip")
    else setLayout(hideTab(current.current, "clipEditor"))
  }, [editorRequest, selectFooterView, setLayout])
  return {
    layout, dockRef, dockFocused, footerCollapsed,
    browserCollapsed: browserBorder ? layout.borders[browserBorder]?.visible === false || !layout.borders[browserBorder]?.selected : !groups.some(group => group.tabs.includes("browser")) && !borderTabs.includes("browser"),
    setLayout,
    toggleBrowser: useCallback(() => {
      const side = findBorder(current.current, "browser")
      if (side) { setLayout(toggleBorderVisible(current.current, side)); return }
      const shown = getGroups(current.current.root).some(group => group.tabs.includes("browser")) || getBorderTabs(current.current).includes("browser")
      if (shown) setLayout(hideTab(current.current, "browser"))
      else {
        const arrangement = getGroups(current.current.root).find(group => group.tabs.includes("arrangement"))
        const next = { ...addPanel(current.current, "browser", arrangement?.id), maximizedGroup: null }
        setLayout(arrangement ? splitGroup(next, "browser", arrangement.id, "left") : next)
      }
    }, [setLayout]),
    toggleFooter: useCallback(() => {
      const side = findBorder(current.current, "clipEditor") ?? findBorder(current.current, "devices")
      const shown = side ? Boolean(current.current.borders[side]?.selected && current.current.borders[side]?.visible !== false) : getGroups(current.current.root).some(group => group.tabs.includes("clipEditor") || group.tabs.includes("devices"))
      setFooterCollapsed(shown)
    }, [setFooterCollapsed]),
    setFooterCollapsed, selectFooterView,
  }
}
