import { useEffect, useLayoutEffect, useRef, type PointerEvent, type RefObject } from "react"
import { hasNativeCursor, moveWindowCursor } from "@/shared/native/cursor"
import { projectActions } from "@/pages/project/adapters"
import { minimapDragLeftEdge, minimapDragRightEdge, minimapDragZoom } from "./zoom"

const PAN_DRAG_SCALE = 0.25

export interface MinimapGeometry {
  bars: number
  viewportWidth: number
  pxPerBar: number
  scrollX: number
  minPxPerBar: number
  maxPxPerBar: number
  onNavigate: () => void
}

type Mode = "left" | "right" | "body" | "jump"
type Anchor = {
  mode: Exclude<Mode, "jump">
  pointerId: number
  originX: number
  originY: number
  lastX: number
  lastY: number
  dx: number
  dy: number
  width: number
  geometry: MinimapGeometry
  initialScrollX: number
  zoomAnchorRatio: number
  phase: "pressed" | "dragging"
  lockPending: boolean
  recentering: boolean
  recenter: Promise<void> | null
}

export function minimapHit(x: number, width: number, geometry: MinimapGeometry): Mode {
  const span = Math.min(geometry.bars, geometry.viewportWidth / geometry.pxPerBar)
  const left = (geometry.scrollX / geometry.pxPerBar / geometry.bars) * width
  const right = left + (span / geometry.bars) * width
  if (x < left - 6 || x > right + 6) return "jump"
  if (Math.min(Math.abs(x - left), Math.abs(x - right)) <= 6)
    return Math.abs(x - left) <= Math.abs(x - right) ? "left" : "right"
  return "body"
}

export function useMinimapGesture(
  element: RefObject<HTMLDivElement | null>,
  geometry: MinimapGeometry
) {
  const latest = useRef(geometry)
  const anchor = useRef<Anchor | null>(null)
  const frame = useRef(0)
  const reveal = useRef<(() => void) | null>(null)
  const pendingRelease = useRef<Promise<void> | null>(null)
  const finish = useRef<(cancel: boolean) => void>(() => {})
  useLayoutEffect(() => {
    latest.current = geometry
  }, [geometry])

  useEffect(() => {
    const mounted = element.current
    if (!mounted) return
    const el = mounted
    let disposed = false
    function publish(a: Anchor) {
      const p = a.geometry
      const deltaBars = (a.dx * p.bars) / a.width
      const input = {
        bars: p.bars,
        viewportWidth: p.viewportWidth,
        minPxPerBar: p.minPxPerBar,
        maxPxPerBar: p.maxPxPerBar,
        startingPxPerBar: p.pxPerBar,
        startingScrollX: a.initialScrollX,
        deltaBars,
      }
      if (a.mode === "left") projectActions.setViewport(minimapDragLeftEdge(input))
      else if (a.mode === "right") projectActions.setViewport(minimapDragRightEdge(input))
      else {
        const zoom = minimapDragZoom(p.pxPerBar, 0, a.dy, p.minPxPerBar, p.maxPxPerBar)
        const anchorBar =
          (a.initialScrollX + p.viewportWidth * a.zoomAnchorRatio) / p.pxPerBar +
          deltaBars * PAN_DRAG_SCALE
        projectActions.setViewport({
          pxPerBar: zoom,
          scrollX: Math.max(
            0,
            Math.min(
              p.bars * zoom - p.viewportWidth,
              anchorBar * zoom - p.viewportWidth * a.zoomAnchorRatio
            )
          ),
        })
      }
    }
    function restore(a: Anchor) {
      if (document.pointerLockElement === el) document.exitPointerLock()
      if (!hasNativeCursor()) {
        document.documentElement.classList.remove("dragpad-dragging")
        return
      }
      let first = 0,
        second = 0
      const show = () => {
        if (reveal.current !== show) return
        cancelAnimationFrame(first)
        cancelAnimationFrame(second)
        reveal.current = null
        document.documentElement.classList.remove("dragpad-dragging")
      }
      // IPC warps cannot be cancelled; finish the last recenter before restoring.
      const restored = (a.recenter ?? Promise.resolve()).then(() =>
        moveWindowCursor(a.originX, a.originY)
      )
      pendingRelease.current = restored.then(
        () => {
          pendingRelease.current = null
          reveal.current = show
          if (disposed) show()
          else
            first = requestAnimationFrame(() => {
              second = requestAnimationFrame(show)
            })
        },
        () => {
          pendingRelease.current = null
          reveal.current = show
          show()
        }
      )
    }
    function end(cancel: boolean) {
      const a = anchor.current
      if (!a) return
      cancelAnimationFrame(frame.current)
      frame.current = 0
      if (cancel)
        projectActions.setViewport({ pxPerBar: a.geometry.pxPerBar, scrollX: a.geometry.scrollX })
      else if (a.phase === "dragging") publish(a)
      anchor.current = null
      if (el.hasPointerCapture?.(a.pointerId)) el.releasePointerCapture(a.pointerId)
      if (a.phase === "dragging") restore(a)
    }
    finish.current = end
    function move(event: globalThis.PointerEvent) {
      const a = anchor.current
      if (!a || event.pointerId !== a.pointerId || a.recentering) return
      a.geometry.onNavigate()
      const locked = document.pointerLockElement === el
      a.dx += locked ? event.movementX : event.clientX - a.lastX
      a.dy += locked ? event.movementY : event.clientY - a.lastY
      a.lastX = event.clientX
      a.lastY = event.clientY
      if (a.phase === "pressed") {
        if (Math.hypot(a.dx, a.dy) < 3) return
        a.phase = "dragging"
        document.documentElement.classList.add("dragpad-dragging")
        if (!hasNativeCursor() && typeof el.requestPointerLock === "function") {
          a.lockPending = true
          try {
            void Promise.resolve(el.requestPointerLock()).then(
              () => {
                a.lockPending = false
                if ((disposed || anchor.current !== a) && document.pointerLockElement === el)
                  document.exitPointerLock()
              },
              () => {
                a.lockPending = false
              }
            )
          } catch {
            a.lockPending = false
          }
        }
      }
      if (!frame.current)
        frame.current = requestAnimationFrame(() => {
          frame.current = 0
          if (anchor.current !== a) return
          publish(a)
          if (hasNativeCursor()) {
            a.recentering = true
            a.recenter = Promise.resolve(moveWindowCursor(a.originX, a.originY)).then(
              () => {
                if (anchor.current === a) {
                  a.lastX = a.originX
                  a.lastY = a.originY
                }
                a.recentering = false
              },
              () => {
                a.recentering = false
              }
            )
          }
        })
    }
    function up(event: globalThis.PointerEvent) {
      if (event.pointerId === anchor.current?.pointerId) end(false)
    }
    function cancel(event: globalThis.PointerEvent) {
      if (event.pointerId === anchor.current?.pointerId) end(true)
    }
    function lost(event: globalThis.PointerEvent) {
      if (event.target !== el || event.pointerId !== anchor.current?.pointerId) return
      if (anchor.current.lockPending || document.pointerLockElement === el) return
      end(true)
    }
    function lockChanged() {
      if (document.pointerLockElement === el) {
        if (!anchor.current) document.exitPointerLock()
        else anchor.current.lockPending = false
      } else if (
        anchor.current?.phase === "dragging" &&
        !hasNativeCursor() &&
        !anchor.current.lockPending
      ) {
        end(true)
      }
    }
    const blur = () => end(true)
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") end(true)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("blur", blur)
    window.addEventListener("keydown", key)
    el.addEventListener("lostpointercapture", lost)
    document.addEventListener("pointerlockchange", lockChanged)
    return () => {
      disposed = true
      end(true)
      if (!pendingRelease.current) reveal.current?.()
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("blur", blur)
      window.removeEventListener("keydown", key)
      el.removeEventListener("lostpointercapture", lost)
      document.removeEventListener("pointerlockchange", lockChanged)
    }
  }, [element])

  return {
    pointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || anchor.current || pendingRelease.current || !element.current) return
      reveal.current?.()
      const p = latest.current
      if (p.viewportWidth <= 0) return
      const rect = element.current.getBoundingClientRect()
      if (rect.width <= 0) return
      event.preventDefault()
      p.onNavigate()
      const x = event.clientX - rect.left
      const mode = minimapHit(x, rect.width, p)
      const initialScrollX =
        mode === "jump"
          ? Math.max(
              0,
              Math.min(
                p.bars * p.pxPerBar - p.viewportWidth,
                (x / rect.width) * p.bars * p.pxPerBar - p.viewportWidth / 2
              )
            )
          : p.scrollX
      anchor.current = {
        mode: mode === "jump" ? "body" : mode,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        dx: 0,
        dy: 0,
        width: rect.width,
        geometry: p,
        initialScrollX,
        zoomAnchorRatio:
          ((x / rect.width) * p.bars * p.pxPerBar - initialScrollX) / p.viewportWidth,
        phase: "pressed",
        lockPending: false,
        recentering: false,
        recenter: null,
      }
      element.current.setPointerCapture?.(event.pointerId)
      if (mode === "jump") projectActions.setViewport({ scrollX: initialScrollX })
    },
    pointerMove(event: PointerEvent<HTMLDivElement>) {
      if (anchor.current) return
      const el = element.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const mode = minimapHit(event.clientX - rect.left, rect.width, latest.current)
      return mode === "left" || mode === "right" ? "ew-resize" : "grab"
    },
    fit() {
      finish.current(true)
      const p = latest.current
      p.onNavigate()
      projectActions.setViewport({ pxPerBar: p.minPxPerBar, scrollX: 0 })
    },
  }
}
