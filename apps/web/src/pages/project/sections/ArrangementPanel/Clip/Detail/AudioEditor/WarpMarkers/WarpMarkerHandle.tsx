import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react"
import {
  getAudioClipSettings,
  type AudioClipSettings,
  type AudioWarpMarker,
} from "@zoeydaw/project-core/audio-editor"
import type { AudioClipContent } from "@zoeydaw/project-core/types"
import { projectActions, useProjectEditGesture } from "@/pages/project/adapters"

export function WarpMarkerHandles({
  clip,
  bpm,
  markers,
  viewStart,
  viewSpan,
  label,
  disabled,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly markers: readonly AudioWarpMarker[]
  readonly viewStart: number
  readonly viewSpan: number
  readonly label: string
  readonly disabled: boolean
}) {
  const active = useRef<{
    settings: AudioClipSettings
    marker: AudioWarpMarker
    x: number
    scale: number
  } | null>(null)
  const gesture = useProjectEditGesture((target: number) => {
    const drag = active.current
    if (!drag) return
    const { settings, marker } = drag
    const existing = settings.warpMarkers ?? []
    const points = existing.some(item => item.id === marker.id)
      ? existing
      : [...existing, marker].sort((left, right) => left.sourceBar - right.sourceBar)
    const index = points.findIndex(item => item.id === marker.id)
    if (index === -1 || points.length > 256) return
    const previous = points[index - 1]
    const next = points[index + 1]
    const sourceBefore = marker.sourceBar - (previous?.sourceBar ?? 0)
    const lower = Math.max(
      (previous?.targetBar ?? 0) + sourceBefore / 10,
      next ? next.targetBar - (next.sourceBar - marker.sourceBar) * 10 : 0
    )
    const upper = Math.min(
      (previous?.targetBar ?? 0) + sourceBefore * 10,
      next ? next.targetBar - (next.sourceBar - marker.sourceBar) / 10 : 1e12
    )
    const inset = Math.min((upper - lower) / 4, 1e-9)
    const value = Math.max(lower + inset, Math.min(upper - inset, target))
    projectActions.updateClip(clip.id, {
      audioSettings: {
        ...settings,
        warpMarkers: points.map(item =>
          item.id === marker.id ? { ...item, targetBar: value } : item
        ),
      },
    })
  })
  useEffect(() => {
    const cancel = () => {
      if (active.current) {
        active.current = null
        gesture.onGestureCancel()
      }
    }
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && active.current) {
        event.preventDefault()
        event.stopPropagation()
        cancel()
      }
    }
    window.addEventListener("keydown", key, true)
    window.addEventListener("blur", cancel)
    return () => {
      window.removeEventListener("keydown", key, true)
      window.removeEventListener("blur", cancel)
    }
  }, [gesture])
  const down = (event: PointerEvent<HTMLButtonElement>, marker: AudioWarpMarker) => {
    if (event.button !== 0 || active.current) return
    const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
    if (width <= 0) return
    event.preventDefault()
    event.stopPropagation()
    active.current = {
      settings: getAudioClipSettings(clip, bpm),
      marker,
      x: event.clientX,
      scale: viewSpan / width,
    }
    gesture.onGestureStart()
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = active.current
    if (drag) gesture.onChange(drag.marker.targetBar + (event.clientX - drag.x) * drag.scale)
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, marker: AudioWarpMarker) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    event.stopPropagation()
    active.current = { settings: getAudioClipSettings(clip, bpm), marker, x: 0, scale: 0 }
    gesture.onGestureStart()
    gesture.onChange(
      marker.targetBar + (event.key === "ArrowRight" ? 1 : -1) / (event.shiftKey ? 256 : 64)
    )
    active.current = null
    gesture.onGestureEnd()
  }
  return markers.map((marker, index) => {
    const percent = ((marker.targetBar - viewStart) / viewSpan) * 100
    if ((percent < 0 || percent > 100) && active.current?.marker.id !== marker.id) return null
    return (
      <button
        key={marker.id}
        type="button"
        disabled={disabled}
        className="audio-detail-marker"
        data-kind="warp"
        aria-label={`${label} ${index + 1}`}
        title={`${label} ${index + 1}`}
        style={{ left: `${Math.max(0, Math.min(100, percent))}%` }}
        onKeyDown={event => keyDown(event, marker)}
        onPointerDown={event => down(event, marker)}
        onPointerMove={move}
        onPointerUp={event => {
          if (!active.current) return
          event.stopPropagation()
          move(event)
          active.current = null
          gesture.onGestureEnd()
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          active.current = null
          gesture.onGestureCancel()
        }}
        onLostPointerCapture={() => {
          if (active.current) {
            active.current = null
            gesture.onGestureCancel()
          }
        }}
      >
        <span />
      </button>
    )
  })
}
