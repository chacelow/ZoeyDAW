import { useCallback } from "react"
import type { SourcePosition, SourceReference } from "@zoeydaw/project-core/realtime"
import { useSourcePaint } from "./useSourcePaint"

export function SourceTimeReadout({ source }: { readonly source: SourceReference | null }) {
  const paint = useCallback((element: HTMLSpanElement, position: SourcePosition | null) => {
    const value = position ? position.seconds.toFixed(1) : "–"
    if (element.textContent !== value) element.textContent = value
  }, [])
  const target = useSourcePaint(source, paint)
  return <span ref={target}>–</span>
}
