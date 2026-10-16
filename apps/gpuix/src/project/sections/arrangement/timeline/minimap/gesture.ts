import { minimapDragBody, minimapPointerDown } from "../../core/viewport/minimap"
import { minimapDragLeftEdge, minimapDragRightEdge } from "../../core/viewport/zoom"
import { dragStarted } from "../../core/interactions/layers"
import type { MinimapAnchor, MinimapGeometry } from "../../core/viewport/minimap"
import type { MinimapViewport } from "../../core/viewport/zoom"
import type { CursorLockPort, ScreenPoint } from "@/ui/controls"
import type { Point } from "../../core/interactions/types"
import type { SessionState } from "@/project/model/types"

interface Press {
  phase: "pressed" | "dragging"
  anchor: MinimapAnchor
  geometry: MinimapGeometry
  width: number
  origin: Point
  cursor: ScreenPoint | null
  hidden: boolean
  epoch: SessionState["editEpoch"]
}

export interface MinimapGestureOptions {
  read: () => {
    geometry: MinimapGeometry
    width: number
    left: number
    epoch: SessionState["editEpoch"]
  }
  publish: (viewport: MinimapViewport) => void
  navigate: () => void
  cursor: CursorLockPort
  onPhaseChange?: (phase: MinimapGesture["phase"]) => void
}

export interface MinimapGesture {
  readonly phase: "idle" | "pressed" | "dragging"
  down: (point: Point, button?: number) => void
  move: (point: Point) => void
  up: () => void
  cancel: () => void
  dispose: () => void
}

/** The store owns the viewport; this controller owns only a pointer-down baseline. */
export function createMinimapGesture({
  read,
  publish,
  navigate,
  cursor,
  onPhaseChange,
}: MinimapGestureOptions): MinimapGesture {
  let press: Press | null = null

  function finish(cancelled = false) {
    const previous = press
    press = null
    if (!previous) return
    onPhaseChange?.("idle")
    if (cancelled && previous.epoch === read().epoch) {
      publish({ pxPerBar: previous.geometry.pxPerBar, scrollX: previous.geometry.scrollX })
    }
    if (previous.hidden && previous.cursor) cursor.restore(previous.cursor)
  }

  return {
    get phase() {
      return press?.phase ?? "idle"
    },
    down(point: Point, button = 0) {
      if (button !== 0) return
      finish()
      const { geometry, width, left, epoch } = read()
      const anchor = minimapPointerDown({ x: point.x - left, width, geometry })
      if (!anchor) return
      press = {
        phase: "pressed",
        anchor,
        geometry,
        width,
        origin: point,
        cursor: cursor.capture(point),
        hidden: false,
        epoch,
      }
      onPhaseChange?.("pressed")
      navigate()
      if (anchor.initialScrollX !== geometry.scrollX) {
        publish({ pxPerBar: geometry.pxPerBar, scrollX: anchor.initialScrollX })
      }
    },
    move(point: Point) {
      if (!press) return
      if (press.epoch !== read().epoch) {
        finish()
        return
      }
      const deltaX = point.x - press.origin.x
      const deltaY = point.y - press.origin.y
      if (press.phase === "pressed") {
        if (!dragStarted(press.origin, point, press.geometry.policy.pointer)) return
        press.phase = "dragging"
        onPhaseChange?.("dragging")
        if (press.cursor) {
          cursor.hide()
          press.hidden = true
        }
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
  }
}
