import { useCallback } from "react"
import type { RefObject } from "react"
import type { SourcePosition, SourceReference } from "@zoeydaw/project-core/realtime"
import { useSourcePaint } from "./useSourcePaint"

export interface SourcePlayheadProps {
  readonly source: SourceReference | null
  readonly startSeconds: number
  readonly spanSeconds: number
  readonly slider?: RefObject<HTMLElement | null>
  readonly mapSeconds?: (seconds: number) => number
}

export function SourcePlayhead({
  source,
  startSeconds,
  spanSeconds,
  slider,
  mapSeconds,
}: SourcePlayheadProps) {
  const paint = useCallback(
    (element: HTMLSpanElement, position: SourcePosition | null) => {
      const progress =
        position && spanSeconds > 0
          ? ((mapSeconds?.(position.seconds) ?? position.seconds) - startSeconds) / spanSeconds
          : null
      element.hidden = progress === null || progress < 0 || progress > 1
      if (!element.hidden && progress !== null) element.style.left = `${progress * 100}%`
      slider?.current?.setAttribute("aria-valuenow", String(position?.seconds ?? 0))
    },
    [startSeconds, spanSeconds, slider, mapSeconds]
  )
  const marker = useSourcePaint(source, paint)
  return (
    <span
      ref={marker}
      hidden
      aria-hidden
      data-source-playhead
      className="bg-foreground pointer-events-none absolute inset-y-0 z-10 w-px"
    />
  )
}
