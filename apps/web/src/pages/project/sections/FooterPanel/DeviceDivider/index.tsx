import { useCallback, useEffect, useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { DEVICE_VIEW_HEIGHT } from "@/pages/project/detail-view"
import type { PointerEvent } from "react"

interface DragState {
  startY: number
  expanded: boolean
  pointerId: number
  target: HTMLDivElement
}

export function DeviceDivider({
  expanded,
  onExpandedChange,
}: {
  readonly expanded: boolean
  readonly onExpandedChange: (expanded: boolean) => void
}) {
  const { t } = useTranslation()
  const drag = useRef<DragState | null>(null)
  const cancel = useCallback(() => {
    const active = drag.current
    if (!active) return
    drag.current = null
    onExpandedChange(active.expanded)
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId)
  }, [onExpandedChange])
  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !drag.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
    }
    window.addEventListener("blur", cancel)
    window.addEventListener("keydown", cancelOnEscape, true)
    return () => {
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", cancelOnEscape, true)
      drag.current = null
    }
  }, [cancel])
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const delta = event.clientY - active.startY
    onExpandedChange(
      active.expanded ? delta < DEVICE_VIEW_HEIGHT / 2 : delta < -DEVICE_VIEW_HEIGHT / 2
    )
  }
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={t("detail.devicesResize")}
      aria-orientation="horizontal"
      aria-controls="project-device-view"
      aria-valuemin={0}
      aria-valuemax={DEVICE_VIEW_HEIGHT}
      aria-valuenow={expanded ? DEVICE_VIEW_HEIGHT : 0}
      className="bg-card focus-visible:bg-primary/40 h-[var(--project-panel-gap)] shrink-0 cursor-row-resize touch-none outline-none"
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault()
        drag.current = {
          startY: event.clientY,
          expanded,
          pointerId: event.pointerId,
          target: event.currentTarget,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={move}
      onPointerUp={event => {
        move(event)
        const active = drag.current
        if (!active || active.pointerId !== event.pointerId) return
        drag.current = null
        if (active.target.hasPointerCapture(active.pointerId))
          active.target.releasePointerCapture(active.pointerId)
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        onExpandedChange(event.key === "ArrowUp" || event.key === "Home")
      }}
    />
  )
}
