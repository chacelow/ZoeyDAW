import { useCallback, useEffect, useRef } from "react"
import type { EventPayload } from "@gpuix/react"
import { projectActions, useProjectEditGesture, useProjectState } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { colorMix } from "@/shared/theme/color-mix"
import { Shape } from "@/shared/svg/Shape"
import { polygonPath } from "@/shared/svg/paths"
import { useClipEditorEnvironment } from "../environment"
import { markerKeyStep, markerPatch, markerPosition } from "./markers"
import type { AudioClip } from "@/project/model/types"
import type { MarkerKind } from "./markers"
import type { SourceView } from "./source-view"

/**
A draggable source marker: a 1px line with a flag at the top (Start/End, loop) or a small square
(fade edges, `lower`). Dragging is relative to the press and edits through one project transaction;
Escape or window deactivation cancels it. Arrow keys nudge one musical sixteenth.
*/
export function SourceMarker({
  clip,
  kind,
  position,
  view,
  width,
  height,
  lower = false,
  label,
}: {
  readonly clip: AudioClip
  readonly kind: MarkerKind
  readonly position: number
  readonly view: SourceView
  readonly width: number
  readonly height: number
  readonly lower?: boolean
  readonly label: string
}) {
  const theme = useTheme()
  const environment = useClipEditorEnvironment()
  const transport = useProjectState(state => state.document.transport)
  const active = useRef<
    | { kind: "pointer"; clip: AudioClip; x: number; value: number; barsPerPixel: number }
    | { kind: "key"; clip: AudioClip }
    | null
  >(null)
  const gesture = useProjectEditGesture((value: number) => {
    const patch = markerPatch(active.current?.clip ?? clip, kind, value, transport.bpm)
    if (patch) projectActions.updateClip(clip.id, patch)
  })
  const cancel = useCallback(() => {
    if (!active.current) return
    active.current = null
    gesture.onGestureCancel()
  }, [gesture])
  useEffect(
    () =>
      environment.subscribeWindowActive(isActive => {
        if (!isActive) cancel()
      }),
    [environment, cancel]
  )
  const flag = theme.control["--spacing-control-gap"] * 3
  const hit = theme.control["--spacing-control-icon"]
  const x = ((position - view.start) / view.span) * width
  if ((x < 0 || x > width) && !active.current) return null
  const right = kind === "end" || kind === "loopEnd"
  const left = Math.max(0, Math.min(width, x))
  const value = (event: EventPayload) => {
    const drag = active.current
    return drag?.kind === "pointer"
      ? drag.value + ((event.x ?? drag.x) - drag.x) * drag.barsPerPixel
      : position
  }
  return (
    <div
      testId={`audio-marker-${kind}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={position}
      aria-valuetext={position.toFixed(4)}
      style={sx({
        position: "absolute",
        left: right ? left - hit : left,
        top: 0,
        width: hit,
        height: lower ? hit : height,
        cursor: "ew-resize",
        hover: { backgroundColor: colorMix(theme.colors.primary, 30, "transparent") },
        keyboardFocusDim: false,
        focusVisible: { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
      })}
      onMouseDown={event => {
        if ((event.button ?? 0) !== 0 || width <= 0) return
        active.current = {
          kind: "pointer",
          clip,
          x: event.x ?? 0,
          value: position,
          barsPerPixel: view.span / width,
        }
        gesture.onGestureStart()
      }}
      onMouseMove={event => {
        if (active.current?.kind === "pointer") gesture.onChange(value(event))
      }}
      onMouseUp={event => {
        if (active.current?.kind !== "pointer") return
        gesture.onChange(value(event))
        active.current = null
        gesture.onGestureEnd()
      }}
      onBlur={cancel}
      onKeyDown={event => {
        if (event.key === "escape" && active.current) {
          event.preventDefault()
          event.stopPropagation()
          cancel()
          return
        }
        if (event.key !== "left" && event.key !== "right") return
        event.preventDefault()
        event.stopPropagation()
        cancel()
        const baseline = useProjectState
          .getState()
          .document.tracks.flatMap(track => track.clips)
          .find(candidate => candidate.id === clip.id)
        if (baseline?.kind !== "audio") return
        active.current = { kind: "key", clip: baseline }
        const step = markerKeyStep(
          transport.numerator,
          transport.denominator,
          Boolean(event.modifiers?.shift)
        )
        gesture.onGestureStart()
        gesture.onChange(
          markerPosition(baseline, kind, transport.bpm) + (event.key === "right" ? step : -step)
        )
        active.current = null
        gesture.onGestureEnd()
      }}
    >
      {lower ? (
        <div
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width: flag,
            height: flag,
            borderWidth: 1,
            borderColor: theme.colors.primary,
            backgroundColor: theme.colors.background,
            pointerEvents: "none",
          })}
        />
      ) : (
        <>
          <div
            style={sx({
              position: "absolute",
              left: right ? hit - 1 : 0,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: theme.colors.primary,
              pointerEvents: "none",
            })}
          />
          <Shape
            width={flag}
            height={flag}
            color={theme.colors.primary}
            paths={[
              {
                d: polygonPath(
                  right
                    ? [
                        { x: flag, y: 0 },
                        { x: 0, y: 0 },
                        { x: flag, y: flag },
                      ]
                    : [
                        { x: 0, y: 0 },
                        { x: flag, y: 0 },
                        { x: 0, y: flag },
                      ]
                ),
                fill: true,
              },
            ]}
            style={{
              position: "absolute",
              left: right ? hit - flag : 0,
              top: 0,
              pointerEvents: "none",
            }}
          />
        </>
      )}
    </div>
  )
}
