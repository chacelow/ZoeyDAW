import { useLayoutEffect } from "react"

export type GestureCursor =
  | "default"
  | "grabbing"
  | "move"
  | "ew-resize"
  | "brace-left"
  | "brace-right"
  | "ns-resize"
  | "crosshair"
  | "text"
  | "not-allowed"
  | "pointer"

const owners = new Map<symbol, GestureCursor>()
let originalCursor: string | null = null

export function useGestureCursor(cursor: GestureCursor | null) {
  useLayoutEffect(() => {
    if (!cursor) {
      return
    }
    const root = document.documentElement
    if (owners.size === 0) {
      originalCursor = root.getAttribute("data-arrangement-cursor")
    }
    const owner = Symbol()
    owners.set(owner, cursor)
    root.setAttribute("data-arrangement-cursor", cursor)
    return () => {
      owners.delete(owner)
      const active = [...owners.values()].at(-1)
      if (active) {
        root.setAttribute("data-arrangement-cursor", active)
      } else if (originalCursor === null) {
        root.removeAttribute("data-arrangement-cursor")
      } else {
        root.setAttribute("data-arrangement-cursor", originalCursor)
      }
      if (!active) {
        originalCursor = null
      }
    }
  }, [cursor])
}
