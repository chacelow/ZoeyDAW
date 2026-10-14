import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { useProjectState } from "./adapters"
import {
  CLIP_VIEW_HEIGHT,
  collapseDetailViews,
  isDetailVisible,
  setDetailVisible,
} from "./detail-view"
import type { DetailSection, DetailViewState } from "./detail-view"
import type { SectionId } from "./types"

export interface ProjectShellApi {
  activeSection: SectionId
  setActiveSection: (id: SectionId) => void
  browserCollapsed: boolean
  footerCollapsed: boolean
  clipCollapsed: boolean
  devicesCollapsed: boolean
  setBrowserCollapsed: (collapsed: boolean) => void
  reportDetailSize: (section: DetailSection, pixels: number) => void
  setDeviceExpanded: (expanded: boolean) => void
  browserHandleRef: React.RefObject<PanelImperativeHandle | null>
  clipHandleRef: React.RefObject<PanelImperativeHandle | null>
  toggleBrowser: () => void
  toggleFooter: () => void
  toggleDetail: (section: DetailSection) => void
}

export function useProjectShell(): ProjectShellApi {
  const [activeSection, setActiveSection] = useState<SectionId>("arrangement")
  const [browserCollapsed, setBrowserCollapsed] = useState(false)
  const [details, setDetails] = useState<DetailViewState>({
    visible: "devices",
    restore: "devices",
  })
  const browserHandleRef = useRef<PanelImperativeHandle | null>(null)
  const clipHandleRef = useRef<PanelImperativeHandle | null>(null)
  const clipHeightRef = useRef(CLIP_VIEW_HEIGHT)
  const editorRequest = useProjectState(state => state.session.clipEditorRequest)

  const toggle = useCallback((handle: PanelImperativeHandle | null) => {
    if (!handle) return
    if (handle.isCollapsed()) handle.expand()
    else handle.collapse()
  }, [])

  useLayoutEffect(() => {
    if (!editorRequest) return
    if (useProjectState.getState().session.editingClipId)
      clipHandleRef.current?.resize(clipHeightRef.current)
    else clipHandleRef.current?.collapse()
  }, [editorRequest])

  const reportDetailSize = useCallback((section: DetailSection, pixels: number) => {
    if (section === "clip" && pixels > 1) clipHeightRef.current = pixels
    setDetails(current => setDetailVisible(current, section, pixels > 1))
  }, [])

  const setDeviceExpanded = useCallback((expanded: boolean) => {
    setDetails(current => setDetailVisible(current, "devices", expanded))
  }, [])
  const devicesVisible = isDetailVisible(details.visible, "devices")
  useLayoutEffect(() => {
    const clip = clipHandleRef.current
    if (clip && !clip.isCollapsed()) clip.resize(clipHeightRef.current)
  }, [devicesVisible])

  const toggleDetail = (section: DetailSection) => {
    if (section === "devices") setDeviceExpanded(!devicesVisible)
    else {
      const handle = clipHandleRef.current
      if (handle?.isCollapsed()) handle.resize(clipHeightRef.current)
      else toggle(handle)
    }
  }
  const toggleFooter = () => {
    if (details.visible === "none") {
      if (isDetailVisible(details.restore, "clip"))
        clipHandleRef.current?.resize(clipHeightRef.current)
      setDeviceExpanded(isDetailVisible(details.restore, "devices"))
    } else {
      setDetails(collapseDetailViews)
      clipHandleRef.current?.collapse()
    }
  }

  return {
    activeSection,
    setActiveSection,
    browserCollapsed,
    footerCollapsed: details.visible === "none",
    clipCollapsed: !isDetailVisible(details.visible, "clip"),
    devicesCollapsed: !isDetailVisible(details.visible, "devices"),
    setBrowserCollapsed,
    reportDetailSize,
    setDeviceExpanded,
    browserHandleRef,
    clipHandleRef,
    toggleBrowser: () => toggle(browserHandleRef.current),
    toggleFooter,
    toggleDetail,
  }
}
