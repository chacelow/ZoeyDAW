import { useEffect, useRef, useState, type RefObject } from "react"
import { dockBorderSides, selectBorderTab, type DockBorderSide, type DockLayoutJSON } from "./model"

interface Options {
  rootRef: RefObject<HTMLDivElement | null>
  latest: RefObject<DockLayoutJSON>
  commitRef: RefObject<(layout: DockLayoutJSON) => void>
}
export interface DockOverlay {
  menuCount: number
  menuOpen: (open: boolean) => void
  hoverBorder: (side: DockBorderSide, tabId?: string) => void
  leaveBorder: (side: DockBorderSide, related: EventTarget | null) => void
}

export function useDockOverlay({ rootRef, latest, commitRef }: Options): DockOverlay {
  const [menuCount, setMenuCount] = useState(0)
  const menuCountRef = useRef(0)
  const hoverTimer = useRef<number | undefined>(undefined)
  const pendingHoverLeave = useRef<(() => void) | null>(null)
  const clearHover = () => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = undefined
    pendingHoverLeave.current = null
  }
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  const hoverBorder = (side: DockBorderSide, tabId?: string) => {
    clearHover()
    const border = latest.current.borders[side]
    if (tabId && border?.type === "overlay" && border.hoverReveal && border.selected !== tabId)
      commitRef.current(selectBorderTab(latest.current, side, tabId))
  }
  const leaveBorder = (side: DockBorderSide, related: EventTarget | null) => {
    if (
      related instanceof Node &&
      [...(rootRef.current?.querySelectorAll(`[data-dock-surface="${side}"]`) ?? [])].some(
        surface => surface.contains(related)
      )
    )
      return
    const border = latest.current.borders[side]
    if (border?.type !== "overlay" || !border.hoverReveal) return
    clearHover()
    const schedule = () => {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = window.setTimeout(() => {
        const currentBorder = latest.current.borders[side]
        if (
          menuCountRef.current === 0 &&
          currentBorder?.type === "overlay" &&
          currentBorder.hoverReveal
        ) {
          pendingHoverLeave.current = null
          commitRef.current(selectBorderTab(latest.current, side, null))
        }
      }, 300)
    }
    pendingHoverLeave.current = schedule
    schedule()
  }
  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => {
      if (menuCountRef.current) return
      const overlay = dockBorderSides.find(
        side =>
          latest.current.borders[side]?.type === "overlay" && latest.current.borders[side]?.selected
      )
      const target = event.target
      if (!overlay || !(target instanceof Node)) return
      const surfaces = rootRef.current?.querySelectorAll(`[data-dock-surface="${overlay}"]`)
      if ([...(surfaces ?? [])].some(surface => surface.contains(target))) return
      commitRef.current(selectBorderTab(latest.current, overlay, null))
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const side = dockBorderSides.find(
        candidate =>
          latest.current.borders[candidate]?.type === "overlay" &&
          latest.current.borders[candidate]?.selected
      )
      if (side && !menuCountRef.current) {
        commitRef.current(selectBorderTab(latest.current, side, null))
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    document.addEventListener("pointerdown", outside, true)
    window.addEventListener("keydown", handleEscape, true)
    return () => {
      document.removeEventListener("pointerdown", outside, true)
      window.removeEventListener("keydown", handleEscape, true)
    }
  }, [rootRef, latest, commitRef])
  const menuOpen = (open: boolean) => {
    menuCountRef.current = Math.max(0, menuCountRef.current + (open ? 1 : -1))
    setMenuCount(menuCountRef.current)
    if (open) clearTimeout(hoverTimer.current)
    else if (menuCountRef.current === 0) pendingHoverLeave.current?.()
  }
  return { menuCount, menuOpen, hoverBorder, leaveBorder }
}
