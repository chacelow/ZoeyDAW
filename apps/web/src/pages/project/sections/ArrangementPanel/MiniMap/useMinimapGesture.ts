import { useEffect, useLayoutEffect, useRef } from "react"
import { projectActions } from "@/pages/project/adapters"
import {
  minimapAnchor,
  minimapEdgeZoom,
  minimapFrame,
  minimapHit,
  minimapPan,
  minimapZoom,
} from "./zoom"
import type { MinimapGeometry, MinimapMode } from "./zoom"
import type { PointerEvent, RefObject } from "react"

export type { MinimapGeometry } from "./zoom"
export { minimapFrame, minimapHit } from "./zoom"

type Anchor = {
  pointerId: number
  lastX: number
  lastY: number
  pressedFrame: { left: number; right: number }
  offset: number
} & (
  | { mode: "body" | "jump"; anchorBar: number }
  | { mode: "left" | "right"; anchorBar: number }
  | { mode: "pan" }
)

export function useMinimapGesture(
  element: RefObject<HTMLDivElement | null>,
  geometry: MinimapGeometry
) {
  const latest = useRef(geometry)
  const anchor = useRef<Anchor | null>(null)
  useLayoutEffect(() => {
    latest.current = geometry
  }, [geometry])

  useEffect(() => {
    const node = element.current
    if (!node) return
    let wheelResidual = 0
    function end() {
      const current = anchor.current
      anchor.current = null
      if (current && node?.hasPointerCapture?.(current.pointerId))
        node.releasePointerCapture(current.pointerId)
    }
    function move(event: globalThis.PointerEvent) {
      const current = anchor.current
      if (!current || current.pointerId !== event.pointerId || !node) return
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0) return
      const p = latest.current
      const dx = event.clientX - current.lastX
      const dy = event.clientY - current.lastY
      current.lastX = event.clientX
      current.lastY = event.clientY
      p.onNavigate()
      let next
      if (current.mode === "pan") {
        const frame = minimapFrame(rect.width, p)
        const x = event.clientX - rect.left - current.offset
        next = minimapPan(p, -Math.trunc(Math.fround(-frame.panRatio * x) + 0.5))
      } else if (current.mode === "left" || current.mode === "right") {
        const x = event.clientX - rect.left - (current.mode === "left" ? current.offset : 0)
        next = minimapZoom(
          p,
          minimapEdgeZoom(rect.width, x, current.mode, current.pressedFrame, p),
          current.anchorBar
        )
      } else if (Math.abs(dx) > Math.abs(dy)) {
        next = minimapPan(p, p.scrollX + dx)
        current.anchorBar = Math.max(
          next.scrollX / p.pxPerBar,
          Math.min((next.scrollX + p.viewportWidth) / p.pxPerBar, current.anchorBar)
        )
      } else {
        next = minimapZoom(
          p,
          (Math.trunc(p.bars * p.pxPerBar + 1.5) * (1 + dy * 0.01)) / p.bars,
          current.anchorBar
        )
      }
      latest.current = { ...p, ...next }
      projectActions.setViewport(next)
    }
    function up(event: globalThis.PointerEvent) {
      if (event.pointerId !== anchor.current?.pointerId) return
      end()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") end()
    }
    function wheel(event: WheelEvent) {
      const zoomModifier = /Mac/.test(navigator.platform) ? event.metaKey : event.ctrlKey
      if (!zoomModifier || anchor.current || !node) return
      event.preventDefault()
      event.stopPropagation()
      const p = latest.current
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0) return
      const unit = event.deltaMode === 1 ? 10 : event.deltaMode === 2 ? rect.height : 1
      wheelResidual -= event.deltaY * unit
      const delta = Math.trunc(wheelResidual)
      wheelResidual -= delta
      if (!delta) return
      const anchorBar = minimapAnchor(rect.width, event.clientX - rect.left, p)
      const next = minimapZoom(
        p,
        (Math.trunc(p.bars * p.pxPerBar + 1.5) * Math.pow(1.05, delta * 0.1)) / p.bars,
        anchorBar
      )
      p.onNavigate()
      latest.current = { ...p, ...next }
      projectActions.setViewport(next)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    window.addEventListener("blur", end)
    window.addEventListener("keydown", key)
    node.addEventListener("lostpointercapture", end)
    node.addEventListener("wheel", wheel, { passive: false })
    return () => {
      end()
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      window.removeEventListener("blur", end)
      window.removeEventListener("keydown", key)
      node.removeEventListener("lostpointercapture", end)
      node.removeEventListener("wheel", wheel)
    }
  }, [element])

  const modeAt = (event: PointerEvent<HTMLDivElement>): MinimapMode => {
    const rect = event.currentTarget.getBoundingClientRect()
    return minimapHit(
      event.clientX - rect.left,
      rect.width,
      latest.current,
      event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
    )
  }
  return {
    pointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || anchor.current || !element.current) return
      const rect = element.current.getBoundingClientRect()
      const p = latest.current
      if (rect.width <= 0 || p.viewportWidth <= 0) return
      event.preventDefault()
      p.onNavigate()
      const x = event.clientX - rect.left
      const mode = modeAt(event)
      let frame = minimapFrame(rect.width, p)
      if (mode === "page") {
        const next = minimapPan(p, p.scrollX + (x < frame.left ? -1 : 1) * p.viewportWidth)
        latest.current = { ...p, ...next }
        projectActions.setViewport(next)
        return
      }
      if (mode === "jump") {
        const position = Math.trunc(x + (4 - (frame.right - frame.left)) * 0.5 - 2)
        const next = minimapPan(p, -Math.trunc(Math.fround(-frame.panRatio * position) + 0.5))
        latest.current = { ...p, ...next }
        projectActions.setViewport(next)
        frame = minimapFrame(rect.width, latest.current)
      }
      const current = latest.current
      const common = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        pressedFrame: frame,
        offset: x - frame.left,
      }
      anchor.current =
        mode === "pan"
          ? { ...common, mode }
          : {
              ...common,
              mode,
              anchorBar:
                mode === "left"
                  ? (current.scrollX + current.viewportWidth) / current.pxPerBar
                  : mode === "right"
                    ? current.scrollX / current.pxPerBar
                    : minimapAnchor(rect.width, x, current),
            }
      element.current.setPointerCapture?.(event.pointerId)
    },
    pointerMove(event: PointerEvent<HTMLDivElement>) {
      if (anchor.current) return
      const mode = modeAt(event)
      return mode === "left"
        ? "brace-left"
        : mode === "right"
          ? "brace-right"
          : mode === "page" || mode === "pan"
            ? "default"
            : "zoom-in"
    },
    fit() {
      const p = latest.current
      p.onNavigate()
      const next = minimapZoom(p, p.viewportWidth / p.bars, 0)
      latest.current = { ...p, ...next }
      projectActions.setViewport(next)
    },
  }
}
