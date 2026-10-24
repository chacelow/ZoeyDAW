import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react"
import type { SourceViewport } from "../useSourceViewport"
import type { WaveformDimensions } from "./useWaveformDimensions"

export type WaveformPointerHandlers = Pick<
  HTMLAttributes<HTMLDivElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture"
>

export type OverviewHandlers = WaveformPointerHandlers &
  Pick<HTMLAttributes<HTMLDivElement>, "onKeyDown" | "onDoubleClick">

export function useWaveformInteraction(
  { view, setView, zoom, pan, fit, minimum, extent }: SourceViewport,
  { surface, width }: Pick<WaveformDimensions, "surface" | "width">
) {
  const [selection, setSelection] = useState<number | null>(null)
  const panDrag = useRef<{ x: number; start: number; scale: number } | null>(null)
  const overviewDrag = useRef<{ x: number; start: number; scale: number } | null>(null)
  const overviewSpan = Math.max(1 / 16_384, extent - minimum)

  useLayoutEffect(() => {
    const node = surface.current
    if (!node) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const rect = node.getBoundingClientRect()
        zoom(
          Math.exp(-event.deltaY * 0.005),
          Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
        )
      } else if (event.shiftKey || Math.abs(event.deltaX) > 0) {
        event.preventDefault()
        pan(((event.deltaX || event.deltaY) / Math.max(1, width)) * view.span)
      }
    }
    node.addEventListener("wheel", wheel, { passive: false })
    return () => node.removeEventListener("wheel", wheel)
  }, [pan, zoom, view.span, width, surface])

  const surfaceHandlers: WaveformPointerHandlers = {
    onPointerDown: event => {
      if (event.button === 1 || (event.button === 0 && event.altKey)) {
        event.preventDefault()
        panDrag.current = {
          x: event.clientX,
          start: view.start,
          scale: view.span / Math.max(1, width),
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      } else if (event.button === 0) {
        const rect = event.currentTarget.getBoundingClientRect()
        setSelection(view.start + ((event.clientX - rect.left) / rect.width) * view.span)
      }
    },
    onPointerMove: event => {
      const drag = panDrag.current
      if (drag)
        setView(previous => ({
          ...previous,
          start: Math.max(minimum, drag.start - (event.clientX - drag.x) * drag.scale),
        }))
    },
    onPointerUp: event => {
      panDrag.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId)
    },
    onPointerCancel: () => {
      panDrag.current = null
    },
    onLostPointerCapture: () => {
      panDrag.current = null
    },
  }
  const overviewHandlers: OverviewHandlers = {
    onDoubleClick: fit,
    onKeyDown: event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      event.preventDefault()
      pan((view.span / 4) * (event.key === "ArrowLeft" ? -1 : 1))
    },
    onPointerDown: event => {
      if (event.button !== 0) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const scale = overviewSpan / Math.max(1, rect.width)
      const clicked = minimum + (event.clientX - rect.left) * scale
      const nextStart =
        clicked >= view.start && clicked <= view.start + view.span
          ? view.start
          : Math.max(minimum, Math.min(extent - view.span, clicked - view.span / 2))
      setView(previous => ({ ...previous, start: nextStart }))
      overviewDrag.current = { x: event.clientX, start: nextStart, scale }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: event => {
      const drag = overviewDrag.current
      if (drag)
        setView(previous => ({
          ...previous,
          start: Math.max(
            minimum,
            Math.min(extent - previous.span, drag.start + (event.clientX - drag.x) * drag.scale)
          ),
        }))
    },
    onPointerUp: event => {
      overviewDrag.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId)
    },
    onPointerCancel: () => {
      overviewDrag.current = null
    },
    onLostPointerCapture: () => {
      overviewDrag.current = null
    },
  }

  return { selection, surfaceHandlers, overviewHandlers }
}
