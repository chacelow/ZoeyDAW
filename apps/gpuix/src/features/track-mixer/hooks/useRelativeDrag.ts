/**
 * Bounded relative drag: right/up increases. gpuix arms pointer capture on
 * mouseDown+mouseMove (see AGENTS.md "Mouse capture is armed by the press"),
 * so mouseMove/mouseUp keep firing after the cursor leaves this control's
 * hitbox — ending the drag on mouseLeave would cap the usable travel to the
 * control's own pixel size. Only mouseUp (or an unexpected button state)
 * ends the gesture.
 */
import { useCallback, useRef, useState } from "react"
import type { EventPayload } from "@gpuix/react"

export interface UseRelativeDragOptions {
  readonly value: number
  readonly min: number
  readonly max: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
  readonly step?: number
  readonly sensitivity?: number
}

export interface RelativeDragHandlers {
  readonly dragging: boolean
  readonly onMouseDown: (event: EventPayload) => void
  readonly onMouseMove: (event: EventPayload) => void
  readonly onMouseUp: (event: EventPayload) => void
}

export function useRelativeDrag({
  value,
  min,
  max,
  onChange,
  disabled = false,
  sensitivity,
  step = 0.1,
}: UseRelativeDragOptions): RelativeDragHandlers {
  const [dragging, setDragging] = useState(false)
  const anchor = useRef<{ x: number; y: number; value: number } | null>(null)
  const unitsPerPixel = sensitivity ?? (max - min) / 150

  const endDrag = useCallback(() => {
    anchor.current = null
    setDragging(false)
  }, [])

  const onMouseDown = (event: EventPayload) => {
    if (disabled || event.button !== 0 || event.x === undefined || event.y === undefined) {
      return
    }
    anchor.current = { x: event.x, y: event.y, value }
    setDragging(true)
  }

  const onMouseMove = (event: EventPayload) => {
    const start = anchor.current
    if (!start) {
      return
    }
    if (disabled || event.pressedButton !== 0) {
      endDrag()
      return
    }
    const distance = (event.x ?? start.x) - start.x + start.y - (event.y ?? start.y)
    const stepped = Math.round((start.value + distance * unitsPerPixel) / step) * step
    const next = Math.min(max, Math.max(min, Number(stepped.toFixed(6))))
    if (next !== value) {
      onChange(next)
    }
  }

  return { dragging, onMouseDown, onMouseMove, onMouseUp: endDrag }
}
