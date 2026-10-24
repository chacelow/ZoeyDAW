import { useCallback, useEffect, useRef, type PointerEvent } from "react"
import {
  resizeBorder,
  resizeSplit,
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
    | { kind: "border"; side: DockBorderSide; size: number; minimum: number }
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
    const horizontal = state.kind === "split" ? state.axis === "x" : state.side !== "bottom"
    const delta = (horizontal ? event.clientX : event.clientY) - state.start
    if (state.kind === "border") {
      const next = Math.max(
        state.minimum,
        Math.min(
          (state.side === "bottom" ? root.height : root.width) - strip - minimumSize,
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
    resize.current = null
    if (preview) commit(preview)
  }
  const start = (state: DockResizeState, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    resize.current = state
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  return { start, move, release, cancel }
}
export interface DockResize {
  start: (state: DockResizeState, event: PointerEvent<HTMLElement>) => void
  move: (event: PointerEvent<HTMLElement>) => void
  release: (event: PointerEvent<HTMLElement>) => void
  cancel: () => boolean
}
