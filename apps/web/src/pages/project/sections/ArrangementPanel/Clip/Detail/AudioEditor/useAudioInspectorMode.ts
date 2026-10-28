import { useCallback, useRef, useState, type PointerEvent } from "react"

export type AudioInspectorMode = "compact" | "wide"

const SWITCH_DISTANCE = 24

type DragState = {
  readonly pointerId: number
  readonly startX: number
  readonly startMode: AudioInspectorMode
}

export function useAudioInspectorMode() {
  const [mode, setMode] = useState<AudioInspectorMode>("compact")
  const drag = useRef<DragState | null>(null)

  const pointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startMode: mode }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [mode]
  )

  const pointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const distance = event.clientX - active.startX
    if (active.startMode === "compact" && distance >= SWITCH_DISTANCE) setMode("wide")
    if (active.startMode === "wide" && distance <= -SWITCH_DISTANCE) setMode("compact")
  }, [])

  const pointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }, [])

  return {
    mode,
    widthClass:
      mode === "wide"
        ? "w-[var(--project-controls-width)]"
        : "w-[calc(var(--project-controls-width)/2)]",
    resizeHandleProps: {
      role: "separator" as const,
      "aria-label": "Switch audio inspector layout",
      "aria-orientation": "vertical" as const,
      "aria-valuetext": mode === "wide" ? "Wide" : "Compact",
      onPointerDown: pointerDown,
      onPointerMove: pointerMove,
      onPointerUp: pointerEnd,
      onPointerCancel: pointerEnd,
      onLostPointerCapture: pointerEnd,
    },
  }
}
