import { minimapDragBody, minimapPointerDown } from "../../core/viewport/minimap"
import { minimapDragLeftEdge, minimapDragRightEdge } from "../../core/viewport/zoom"
import type { MinimapAnchor, MinimapGeometry } from "../../core/viewport/minimap"
import type { MinimapViewport } from "../../core/viewport/zoom"

export interface CursorPoint {
  x: number
  y: number
}

export interface CursorPort {
  position: () => CursorPoint | null
  hide: () => boolean
  restore: (point: CursorPoint) => boolean
}

interface Press {
  phase: "pressed" | "dragging"
  anchor: MinimapAnchor
  geometry: MinimapGeometry
  width: number
  origin: CursorPoint
  cursor: CursorPoint | null
  hidden: boolean
}

export interface MinimapGestureOptions {
  read: () => { geometry: MinimapGeometry; width: number; left: number }
  publish: (viewport: MinimapViewport) => void
  navigate: () => void
  cursor: CursorPort
}

/** The store owns the viewport; this controller owns only a pointer-down baseline. */
export function createMinimapGesture({ read, publish, navigate, cursor }: MinimapGestureOptions) {
  let press: Press | null = null

  function finish(cancelled = false) {
    const previous = press
    press = null
    if (!previous) return
    if (cancelled) {
      publish({ pxPerBar: previous.geometry.pxPerBar, scrollX: previous.geometry.scrollX })
    }
    if (previous.hidden && previous.cursor) cursor.restore(previous.cursor)
  }

  return {
    get phase() {
      return press?.phase ?? "idle"
    },
    down(point: CursorPoint, button = 0) {
      if (button !== 0) return
      finish()
      const { geometry, width, left } = read()
      const anchor = minimapPointerDown({ x: point.x - left, width, geometry })
      if (!anchor) return
      press = {
        phase: "pressed",
        anchor,
        geometry,
        width,
        origin: point,
        cursor: cursor.position(),
        hidden: false,
      }
      navigate()
      if (anchor.initialScrollX !== geometry.scrollX) {
        publish({ pxPerBar: geometry.pxPerBar, scrollX: anchor.initialScrollX })
      }
    },
    move(point: CursorPoint) {
      if (!press) return
      const deltaX = point.x - press.origin.x
      const deltaY = point.y - press.origin.y
      if (press.phase === "pressed") {
        if (Math.hypot(deltaX, deltaY) < 3) return
        press.phase = "dragging"
        press.hidden = press.cursor !== null && cursor.hide()
      }
      navigate()
      const { geometry, width, anchor } = press
      const input = {
        bars: geometry.bars,
        viewportWidth: geometry.viewportWidth,
        minPxPerBar: geometry.minPxPerBar,
        maxPxPerBar: geometry.maxPxPerBar,
        startingPxPerBar: geometry.pxPerBar,
        startingScrollX: anchor.initialScrollX,
        deltaBars: (deltaX * geometry.bars) / width,
      }
      publish(
        anchor.mode === "left"
          ? minimapDragLeftEdge(input)
          : anchor.mode === "right"
            ? minimapDragRightEdge(input)
            : minimapDragBody({
                geometry,
                width,
                ...anchor,
                deltaX,
                deltaY,
              })
      )
    },
    up: () => finish(),
    cancel: () => finish(true),
    dispose: () => finish(true),
    fit() {
      finish()
      const { geometry } = read()
      if (geometry.viewportWidth <= 0) return
      navigate()
      publish({
        pxPerBar: Math.max(
          geometry.minPxPerBar,
          Math.min(geometry.maxPxPerBar, geometry.viewportWidth / geometry.bars)
        ),
        scrollX: 0,
      })
    },
  }
}
