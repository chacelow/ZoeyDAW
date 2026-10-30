import { useCallback, useEffect, useRef, type PointerEvent } from "react"
import {
  collapseBorderTab,
  expandCollapsedBorder,
  resizeBorder,
  resizeSplit,
  selectBorderTab,
  type DockBorderSide,
  type DockBounds,
  type DockLayoutJSON,
} from "./model"
import { minimumSize, strip } from "./dock-presentation"

type ResizePointer = { pointer: number; start: number }
export type DockResizeState = ResizePointer &
  (
    | {
        kind: "split"
        id: string
        index: number
        axis: "x" | "y"
        sizes: readonly number[]
        minima: readonly number[]
      }
    | { kind: "border"; side: DockBorderSide; size: number; minimum: number; fixed?: boolean }
    | { kind: "collapsed"; side: DockBorderSide }
  )

interface Options {
  layout: DockLayoutJSON
  root: DockBounds
  preview: DockLayoutJSON | null
  setPreview: (preview: DockLayoutJSON | null) => void
  commit: (layout: DockLayoutJSON) => void
}

export function useDockResize({ layout, root, preview, setPreview, commit }: Options) {
  const resize = useRef<DockResizeState | null>(null)
  const cancel = useCallback(() => {
    if (!resize.current) return false
    resize.current = null
    setPreview(null)
    return true
  }, [setPreview])
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && cancel()) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    const blur = () => {
      cancel()
    }
    const deactivate = () => {
      if (document.hidden) cancel()
    }
    window.addEventListener("keydown", handleEscape, true)
    window.addEventListener("blur", blur)
    document.addEventListener("visibilitychange", deactivate)
    return () => {
      window.removeEventListener("keydown", handleEscape, true)
      window.removeEventListener("blur", blur)
      document.removeEventListener("visibilitychange", deactivate)
    }
  }, [cancel])

  const move = (event: PointerEvent<HTMLElement>) => {
    const state = resize.current
    if (!state || event.pointerId !== state.pointer) return
    const horizontal =
      state.kind === "split" || (state.kind === "border" && state.side !== "bottom")
    const delta = (horizontal ? event.clientX : event.clientY) - state.start
    if (state.kind === "collapsed") {
      if (state.side === "bottom" && delta < -30) {
        resize.current = null
        setPreview(null)
        commit(expandCollapsedBorder(layout, state.side))
      }
      return
    }
    if (state.kind === "border") {
      if (state.side === "bottom") {
        if (state.fixed) {
          if (delta > 30) {
            resize.current = null
            setPreview(null)
            commit(collapseBorderTab(layout, "bottom"))
          } else {
            setPreview(layout)
          }
        } else {
          setPreview(resizeBorder(layout, "bottom", state.size - delta))
        }
        return
      }
      const next = Math.max(
        state.minimum,
        Math.min(
          root.width - strip - minimumSize,
          state.size + (state.side === "left" ? delta : -delta)
        )
      )
      setPreview(resizeBorder(layout, state.side, next))
      return
    }
    const next = [...state.sizes]
    const change = Math.max(
      state.minima[state.index] - next[state.index],
      Math.min(next[state.index + 1] - state.minima[state.index + 1], delta)
    )
    next[state.index] += change
    next[state.index + 1] -= change
    setPreview(resizeSplit(layout, state.id, next))
  }
  const release = (event: PointerEvent<HTMLElement>) => {
    if (!resize.current || resize.current.pointer !== event.pointerId) return
    const state = resize.current
    resize.current = null
    if (state.kind === "collapsed") {
      if (state.side === "bottom" && event.clientY - state.start < -30)
        commit(expandCollapsedBorder(layout, state.side))
      return
    }
    if (state.kind === "border" && state.side === "bottom") {
      const delta = event.clientY - state.start
      if (state.fixed && delta > 30) {
        commit(collapseBorderTab(layout, "bottom"))
        return
      }
      if (preview) commit(preview)
      return
    }
    if (preview) commit(preview)
  }
  const toggle = (side: DockBorderSide) => {
    if (side === "bottom") {
      commit(selectBorderTab(layout, "bottom", layout.borders.bottom?.selected ? null : "devices"))
    }
  }
  const start = (state: DockResizeState, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    resize.current = state
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  return { start, move, release, cancel, toggle }
}
export interface DockResize {
  start: (state: DockResizeState, event: PointerEvent<HTMLElement>) => void
  move: (event: PointerEvent<HTMLElement>) => void
  release: (event: PointerEvent<HTMLElement>) => void
  cancel: () => boolean
  toggle?: (side: DockBorderSide) => void
}
