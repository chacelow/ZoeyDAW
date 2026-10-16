import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, PublicInstance } from "@gpuix/react"
import { projectActions, useProjectEditGesture, useProjectState } from "@/project/adapters"
import { patternWindow } from "@/project/model/pattern-window"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { ControlledScrollbar } from "@/ui/controls"
import { useClipEditorEnvironment } from "../environment"
import { patternGeometry, patternScrollToStep, patternStepAt, patternStepRect } from "./geometry"
import type { PatternClip } from "@/project/model/types"

/** One source cycle, one editing focus owner, and the same rectangles for paint and picking. */
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
  const painting = useRef<{ value: boolean; last: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [offset, setOffset] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const source = patternWindow(clip)
  const length = Math.min(source.period, Math.max(1, source.end - source.first))
  const gap = theme.control["--spacing-control-gap"]
  const border = theme.design.shape.controlBorderWidth
  const minimum = theme.control["--spacing-control-track"]
  const height = theme.project.midiRulerHeight
  const geometry = useMemo(
    () => patternGeometry({ count: length, viewport: width, gap, border, minimum, offset }),
    [length, width, gap, border, minimum, offset]
  )
  const current = Math.min(length - 1, currentStep)
  const sourceIndex = (index: number) =>
    (((source.first + index) % source.period) + source.period) % source.period
  const isOn = (index: number) => clip.steps?.[sourceIndex(index)] === true
  const scrollTo = (value: number) => setOffset(Math.max(0, Math.min(geometry.maximum, value)))
  const focusOwner = () => {
    if (host.current) renderer?.focusElement?.(host.current.id)
  }
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
      { length: Math.max(source.period, current.steps?.length ?? 0) },
      (_, index) => current.steps?.[index] === true
    )
    let changed = false
    for (let step = Math.min(from, to); step <= Math.max(from, to); step++) {
      const index = sourceIndex(step)
      if (steps[index] === value) continue
      steps[index] = value
      changed = true
    }
    if (changed) transaction.onChange(steps)
  }

  function stepAt(event: EventPayload): number | null {
    const bounds = host.current && renderer?.getElementBounds?.(host.current.id)
    return bounds && bounds.width > 0
      ? patternStepAt(geometry, (event.x ?? bounds.x) - bounds.x)
      : null
  }

  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minWidth: 0,
        flexShrink: 0,
      })}
    >
      <div
        ref={host}
        testId="pattern-steps"
        role="group"
        tabIndex={0}
        aria-label={`${label} ${current + 1}/${length}`}
        style={sx({
          position: "relative",
          width: "100%",
          minWidth: 0,
          height,
          flexShrink: 0,
          overflow: "hidden",
          keyboardFocusDim: false,
          focusVisible: {
            outlineWidth: theme.design.shape.focusRingWidth,
            outlineColor: theme.colors.ring,
            outlineOffset: -theme.design.shape.focusRingWidth,
          },
        })}
        onLayout={event => {
          if (event.width !== undefined) setWidth(event.width)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          const focus = renderer?.getFocusedElementId?.()
          if (focus !== null && focus !== undefined && focus !== host.current?.id) finish(true)
        }}
        onMouseDown={event => {
          if ((event.button ?? 0) !== 0 || painting.current) return
          const index = stepAt(event)
          if (index === null) return
          focusOwner()
          setCurrentStep(index)
          const value = !isOn(index)
          painting.current = { value, last: index }
          transaction.onGestureStart()
          paint(index, index, value)
        }}
        onMouseMove={event => {
          const index = stepAt(event)
          if (index === null) return
          const active = painting.current
          if (!active) {
            setHovered(index)
            return
          }
          if (active.last === index) return
          paint(active.last, index, active.value)
          active.last = index
          setCurrentStep(index)
        }}
        onMouseUp={() => finish(false)}
        onMouseLeave={() => setHovered(null)}
        onScroll={event => {
          if (event.modifiers?.cmd || event.modifiers?.ctrl) return
          const delta = event.deltaX || event.deltaY || 0
          if (!delta || !geometry.maximum) return
          scrollTo(geometry.offset - delta)
        }}
        onKeyDown={event => {
          if (event.key === "escape" && painting.current) {
            event.preventDefault()
            event.stopPropagation()
            finish(true)
            return
          }
          if (
            (event.modifiers?.cmd || event.modifiers?.ctrl) &&
            event.key === "z" &&
            painting.current
          ) {
            event.preventDefault()
            event.stopPropagation()
            finish(true)
            return
          }
          if (event.modifiers?.cmd || event.modifiers?.ctrl || event.modifiers?.alt) return
          let next: number | null = null
          if (event.key === "left") next = Math.max(0, current - 1)
          else if (event.key === "right") next = Math.min(length - 1, current + 1)
          else if (event.key === "home") next = 0
          else if (event.key === "end") next = length - 1
          if (next !== null) {
            event.preventDefault()
            event.stopPropagation()
            setCurrentStep(next)
            scrollTo(patternScrollToStep(geometry, next))
          } else if (event.key === "enter" && !event.isHeld) {
            event.preventDefault()
            event.stopPropagation()
            if (painting.current) return
            transaction.onGestureStart()
            paint(current, current, !isOn(current))
            transaction.onGestureEnd()
          }
        }}
      >
        {Array.from({ length: geometry.end - geometry.first }, (_, offset) => {
          const index = geometry.first + offset
          const rect = patternStepRect(geometry, index)
          const on = isOn(index)
          return (
            <div
              key={index}
              testId={`pattern-step-${index}`}
              role="button"
              tabIndex={-1}
              aria-label={`${label} ${index + 1}`}
              aria-pressed={on}
              style={sx({
                position: "absolute",
                left: rect.x,
                top: 0,
                width: rect.width,
                height,
                borderWidth: border,
                borderRadius: theme.design.shape.toggleRadius,
                borderColor:
                  focused && index === current
                    ? theme.colors.foreground
                    : theme.colors.arrangementLine,
                backgroundColor: on
                  ? color
                  : hovered === index
                    ? theme.colors.arrangementSurfaceSelected
                    : theme.colors.arrangementSurface,
                pointerEvents: "none",
              })}
            />
          )
        })}
      </div>
      {geometry.maximum > 0 ? (
        <ControlledScrollbar
          testId="pattern-horizontal-scroll"
          aria-label={label}
          aria-controls="pattern-steps"
          orientation="horizontal"
          tabIndex={-1}
          value={geometry.offset}
          viewport={geometry.viewport}
          extent={geometry.extent}
          length={geometry.viewport}
          onChange={scrollTo}
          onMouseUp={focusOwner}
          style={{ flexShrink: 0 }}
        />
      ) : null}
    </div>
  )
}
