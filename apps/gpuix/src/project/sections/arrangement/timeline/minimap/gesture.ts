import { minimapDragBody, minimapPointerDown, minimapSelection } from "../../core/viewport/minimap"
import { minimapDragLeftEdge, minimapDragRightEdge } from "../../core/viewport/zoom"
import { dragStarted } from "../../core/interactions/layers"
import type { MinimapAnchor, MinimapGeometry } from "../../core/viewport/minimap"
import type { MinimapViewport } from "../../core/viewport/zoom"
import type { CursorLockPort } from "@/ui/controls"
import type { Point } from "../../core/interactions/types"
import type { SessionState } from "@/project/model/types"

interface Press {
  phase: "pressed" | "dragging"
  anchor: MinimapAnchor
  geometry: MinimapGeometry
  width: number
  origin: Point
  hidden: boolean
  epoch: SessionState["editEpoch"]
  grab: number
  viewport: MinimapViewport
  movedX: number
  movedY: number
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
  cursor: CursorLockPort | undefined
  onPhaseChange?: (phase: MinimapGesture["phase"]) => void
}

export interface MinimapGesture {
  readonly phase: "idle" | "pressed" | "dragging"
  down: (point: Point, button?: number) => void
  move: (point: Point, delta?: Point) => void
  up: () => void
  cancel: () => void
  dispose: () => void
}

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
    if (previous.hidden) {
      const moved = cancelled ? 0 : releaseOffset(previous)
      cursor?.end({ x: previous.origin.x + moved, y: previous.origin.y })
    }
  }

  function releaseOffset({ anchor, geometry, width, viewport, grab }: Press) {
    const start = minimapSelection(
      { pxPerBar: geometry.pxPerBar, scrollX: anchor.initialScrollX },
      width,
      geometry
    )
    const end = minimapSelection(viewport, width, geometry)
    return (
      end.left + (end.right - end.left) * grab - (start.left + (start.right - start.left) * grab)
    )
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
      const initial = { pxPerBar: geometry.pxPerBar, scrollX: anchor.initialScrollX }
      const selection = minimapSelection(initial, width, geometry)
      const span = selection.right - selection.left
      const grab =
        anchor.mode === "left"
          ? 0
          : anchor.mode === "right"
            ? 1
            : span > 0
              ? Math.min(1, Math.max(0, (point.x - left - selection.left) / span))
              : 0
      press = {
        phase: "pressed",
        anchor,
        geometry,
        width,
        origin: point,
        hidden: false,
        epoch,
        grab,
        viewport: initial,
        movedX: 0,
        movedY: 0,
      }
      onPhaseChange?.("pressed")
      navigate()
      if (anchor.initialScrollX !== geometry.scrollX) {
        publish({ pxPerBar: geometry.pxPerBar, scrollX: anchor.initialScrollX })
      }
    },
    move(point: Point, delta?: Point) {
      if (!press) return
      if (press.epoch !== read().epoch) {
        finish()
        return
      }
      if (press.phase === "pressed") {
        if (!dragStarted(press.origin, point, press.geometry.policy.pointer)) return
        press.phase = "dragging"
        onPhaseChange?.("dragging")
        if (cursor) {
          cursor.begin()
          press.hidden = true
        }
        press.movedX = point.x - press.origin.x
        press.movedY = point.y - press.origin.y
      } else if (press.hidden && delta) {
        press.movedX += delta.x
        press.movedY += delta.y
      } else {
        press.movedX = point.x - press.origin.x
        press.movedY = point.y - press.origin.y
      }
      const deltaX = press.movedX
      const deltaY = press.movedY
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
      press.viewport =
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
      publish(press.viewport)
    },
    up: () => finish(),
    cancel: () => finish(true),
    dispose: () => finish(true),
  }
}
