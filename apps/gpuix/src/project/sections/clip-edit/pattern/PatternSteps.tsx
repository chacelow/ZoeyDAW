import { useCallback, useEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, PublicInstance } from "@gpuix/react"
import { projectActions, useProjectEditGesture, useProjectState } from "@/project/adapters"
import { patternWindow } from "@/project/model/pattern-window"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useClipEditorEnvironment } from "../environment"
import type { PatternClip } from "@/project/model/types"

/**
One source cycle of steps, starting at the clip's first visible step. A press toggles the step and
paints that value across every step the pointer crosses; the whole stroke is one undo entry.
Escape or window deactivation cancels the stroke.
*/
export function PatternSteps({
  clip,
  label,
  color,
}: {
  readonly clip: PatternClip
  readonly label: string
  readonly color: string
}) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const environment = useClipEditorEnvironment()
  const transaction = useProjectEditGesture((steps: boolean[]) =>
    projectActions.updateClip(clip.id, { steps })
  )
  const host = useRef<PublicInstance | null>(null)
  const painting = useRef<{ value: boolean; last: number; left: number; cell: number } | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const source = patternWindow(clip)
  const first = source.first
  const period = source.period
  const length = Math.min(period, Math.max(1, source.end - source.first))
  const isOn = (index: number) => clip.steps?.[(first + index) % period] === true

  const finish = useCallback(
    (cancel: boolean) => {
      if (!painting.current) return
      painting.current = null
      if (cancel) transaction.onGestureCancel()
      else transaction.onGestureEnd()
    },
    [transaction]
  )
  useEffect(
    () =>
      environment.subscribeWindowActive(active => {
        if (!active) finish(true)
      }),
    [environment, finish]
  )

  function paint(from: number, to: number, value: boolean) {
    const current = useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(item => item.id === clip.id)
    if (current?.kind !== "pattern") return
    const steps = Array.from(
      { length: Math.max(period, current.steps?.length ?? 0) },
      (_, index) => current.steps?.[index] === true
    )
    let changed = false
    for (let step = Math.min(from, to); step <= Math.max(from, to); step++) {
      const index = (first + step) % steps.length
      if (steps[index] === value) continue
      steps[index] = value
      changed = true
    }
    if (changed) transaction.onChange(steps)
  }

  const stepAt = (event: EventPayload, active: { left: number; cell: number }) =>
    Math.max(
      0,
      Math.min(length - 1, Math.floor(((event.x ?? active.left) - active.left) / active.cell))
    )

  const gap = theme.control["--spacing-control-gap"]
  return (
    <div
      ref={host}
      testId="pattern-steps"
      role="group"
      aria-label={label}
      style={sx({ display: "flex", flexDirection: "row", gap, width: "100%" })}
      onMouseDown={event => {
        if ((event.button ?? 0) !== 0 || painting.current || !host.current) return
        const bounds = renderer?.getElementBounds?.(host.current.id)
        if (!bounds || bounds.width <= 0) return
        const geometry = { left: bounds.x, cell: (bounds.width + gap) / length }
        const index = stepAt(event, geometry)
        const value = !isOn(index)
        painting.current = { value, last: index, ...geometry }
        transaction.onGestureStart()
        paint(index, index, value)
      }}
      onMouseMove={event => {
        const active = painting.current
        const bounds = host.current && renderer?.getElementBounds?.(host.current.id)
        if (!active) {
          if (bounds)
            setHovered(stepAt(event, { left: bounds.x, cell: (bounds.width + gap) / length }))
          return
        }
        const index = stepAt(event, active)
        if (index === active.last) return
        paint(active.last, index, active.value)
        active.last = index
      }}
      onMouseUp={() => finish(false)}
      onMouseLeave={() => setHovered(null)}
      onBlur={() => finish(true)}
      onKeyDown={event => {
        if (event.key !== "escape" || !painting.current) return
        event.preventDefault()
        event.stopPropagation()
        finish(true)
      }}
    >
      {Array.from({ length }, (_, index) => {
        const on = isOn(index)
        return (
          <div
            key={index}
            testId={`pattern-step-${index}`}
            role="button"
            tabIndex={0}
            aria-label={`${label} ${index + 1} (${on ? "on" : "off"})`}
            aria-pressed={on}
            style={sx({
              flexGrow: 1,
              flexBasis: 0,
              minWidth: 0,
              height: theme.project.midiRulerHeight,
              borderWidth: 1,
              borderRadius: 2,
              borderColor: theme.colors.arrangementLine,
              backgroundColor: on
                ? color
                : hovered === index
                  ? theme.colors.arrangementSurfaceSelected
                  : theme.colors.arrangementSurface,
              pointerEvents: "none",
              keyboardFocusDim: false,
              focusVisible: { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
            })}
            onKeyDown={event => {
              // Enter toggles a focused step; Space stays the transport key.
              if (event.key !== "enter" || event.isHeld) return
              event.preventDefault()
              event.stopPropagation()
              transaction.onGestureStart()
              paint(index, index, !on)
              transaction.onGestureEnd()
            }}
          />
        )
      })}
    </div>
  )
}
