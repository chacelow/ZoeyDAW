import { clipBarAtSourceCoordinate, projectTempoSections } from "@zoeydaw/project-core/tempo-map"
import { useEffect, useRef } from "react"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import {
  audioLoopWindow,
  audioSourceWindow,
  getAudioClipSettings,
} from "@zoeydaw/project-core/audio-editor"
import { fadeControls } from "@zoeydaw/project-core/fades"
import { MIN_CLIP_LENGTH_BARS } from "@zoeydaw/project-core/grid"
import type { AudioClipContent } from "@zoeydaw/project-core/types"
import type { KeyboardEvent, PointerEvent } from "react"

type MarkerKind = "start" | "end" | "loopStart" | "loopEnd" | "fadeIn" | "fadeOut"

export function SourceMarker({
  clip,
  bpm,
  numerator,
  denominator,
  kind,
  label,
  help,
  position,
  viewStart,
  viewSpan,
  lower = false,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly numerator: number
  readonly denominator: number
  readonly kind: MarkerKind
  readonly label: string
  readonly help: string
  readonly position: number
  readonly viewStart: number
  readonly viewSpan: number
  readonly lower?: boolean
}) {
  const active = useRef<{
    clip: AudioClipContent
    x: number
    value: number
    barsPerPixel: number
  } | null>(null)
  const tempoTracks = useProjectState(state => state.document.tracks)
  const timebase = {
    bpm,
    numerator,
    denominator,
    tempo: projectTempoSections(tempoTracks, { bpm, numerator, denominator }),
  }
  const gesture = useProjectEditGesture((value: number) => {
    const baseline = active.current?.clip ?? clip
    const localBar = clipBarAtSourceCoordinate(baseline, timebase, value)
    if (kind === "loopStart" || kind === "loopEnd") {
      const settings = getAudioClipSettings(baseline, bpm)
      const loopEnd = settings.loopStartBars + settings.loopLengthBars
      const loopStart =
        kind === "loopStart"
          ? Math.max(0, Math.min(loopEnd - MIN_CLIP_LENGTH_BARS, value))
          : settings.loopStartBars
      const loopLength = kind === "loopEnd" ? value - loopStart : loopEnd - loopStart
      projectActions.updateClip(clip.id, {
        audioSettings: audioLoopWindow(settings, loopStart, loopLength),
      })
      return
    }
    if (kind === "start" || kind === "end") {
      const settings = getAudioClipSettings(baseline, bpm)
      const patch = audioSourceWindow(
        baseline,
        kind === "start"
          ? Math.max(0, Math.min(settings.endMarkerBars - MIN_CLIP_LENGTH_BARS, value))
          : settings.startMarkerBars,
        kind === "end"
          ? Math.max(settings.startMarkerBars + MIN_CLIP_LENGTH_BARS, value)
          : settings.endMarkerBars,
        bpm
      )
      if (patch) projectActions.updateClip(clip.id, patch)
      return
    }
    const inFade = fadeControls(baseline, "in")
    const outFade = fadeControls(baseline, "out")
    const patch =
      kind === "fadeIn"
        ? {
            fadeInBars: Math.max(0, Math.min(outFade.start, localBar) - inFade.start),
          }
        : { fadeOutBars: Math.max(0, outFade.end - Math.max(inFade.end, localBar)) }
    projectActions.updateClip(clip.id, patch)
  })
  useEffect(() => {
    const cancel = () => {
      if (!active.current) return
      active.current = null
      gesture.onGestureCancel()
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
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
    if (width <= 0) return
    active.current = { clip, x: event.clientX, value: position, barsPerPixel: viewSpan / width }
    gesture.onGestureStart()
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    event.stopPropagation()
    gesture.onGestureStart()
    gesture.onChange(
      position +
        ((event.key === "ArrowRight" ? 1 : -1) * denominator) /
          (numerator * 16) /
          (event.shiftKey ? 4 : 1)
    )
    gesture.onGestureEnd()
  }
  const percent = ((position - viewStart) / viewSpan) * 100
  if ((percent < 0 || percent > 100) && !active.current) return null
  return (
    <button
      type="button"
      className="audio-detail-marker"
      data-kind={kind}
      data-lower={lower || undefined}
      aria-label={label}
      title={`${label} · ${help}`}
      style={{
        left: `${Math.max(0, Math.min(100, percent))}%`,
        transform: percent > 95 ? "translateX(-100%)" : undefined,
      }}
      onKeyDown={keyDown}
      onPointerDown={pointerDown}
      onPointerMove={event => {
        const baseline = active.current
        if (!baseline) return
        gesture.onChange(baseline.value + (event.clientX - baseline.x) * baseline.barsPerPixel)
      }}
      onPointerUp={event => {
        const baseline = active.current
        if (!baseline) return
        event.stopPropagation()
        gesture.onChange(baseline.value + (event.clientX - baseline.x) * baseline.barsPerPixel)
        active.current = null
        gesture.onGestureEnd()
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        active.current = null
        gesture.onGestureCancel()
      }}
      onLostPointerCapture={() => {
        if (!active.current) return
        active.current = null
        gesture.onGestureCancel()
      }}
    >
      <span />
    </button>
  )
}
