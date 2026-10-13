import { useCallback, useEffect, useRef } from "react"
import type { PatternClip } from "@/pages/project/model/types"
import { patternWindow } from "@/pages/project/model/pattern-window"
import { projectActions, useProjectState } from "@/pages/project/adapters"

export function PatternSteps({ clip, label }: { clip: PatternClip; label: string }) {
  const painting = useRef<{
    value: boolean
    last: number
    pointerId: number
    target: HTMLElement
  } | null>(null)
  const finish = useCallback((cancel: boolean) => {
    const active = painting.current
    if (!active) return
    painting.current = null
    if (cancel) projectActions.cancelEdit()
    else projectActions.endEdit()
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId)
  }, [])
  useEffect(() => {
    const blur = () => finish(true)
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !painting.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      finish(true)
    }
    window.addEventListener("blur", blur)
    window.addEventListener("keydown", escape, true)
    return () => {
      finish(true)
      window.removeEventListener("blur", blur)
      window.removeEventListener("keydown", escape, true)
    }
  }, [clip.id, finish])
  const sourceWindow = patternWindow(clip)
  const sourceStep = sourceWindow.first
  const patternLength = sourceWindow.period
  const length = Math.min(patternLength, Math.max(1, sourceWindow.end - sourceWindow.first))
  function paint(index: number, value: boolean, from = index) {
    const current = useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(item => item.id === clip.id)
    if (current?.kind !== "pattern") return
    const steps = Array.from(
      { length: Math.max(patternLength, current.steps?.length ?? 0) },
      (_, i) => !!current.steps?.[i]
    )
    let changed = false
    for (let step = Math.min(from, index); step <= Math.max(from, index); step++) {
      const sourceIndex = (sourceStep + step) % steps.length
      if (steps[sourceIndex] === value) continue
      steps[sourceIndex] = value
      changed = true
    }
    if (changed) projectActions.updateClip(clip.id, { steps })
  }
  return (
    <div
      className="flex flex-wrap gap-1 touch-none"
      onPointerMove={event => {
        const active = painting.current
        if (!active || event.pointerId !== active.pointerId) return
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-step-index]")
        if (!target || !event.currentTarget.contains(target)) return
        const index = Number(target.dataset.stepIndex)
        if (index === active.last) return
        paint(index, active.value, active.last)
        active.last = index
      }}
      onPointerUp={event => {
        if (event.pointerId === painting.current?.pointerId) finish(false)
      }}
      onPointerCancel={event => {
        if (event.pointerId === painting.current?.pointerId) finish(true)
      }}
      onLostPointerCapture={event => {
        if (event.pointerId === painting.current?.pointerId) finish(true)
      }}
    >
      {Array.from({ length }, (_, index) => (
        <button
          key={index}
          data-step-index={index}
          aria-label={`${label} ${index + 1}`}
          aria-pressed={!!clip.steps?.[(sourceStep + index) % patternLength]}
          title={`${label} ${index + 1}`}
          className={`h-10 min-w-6 flex-1 rounded-sm border border-border ${clip.steps?.[(sourceStep + index) % patternLength] ? "bg-primary" : "bg-muted/40 hover:bg-muted"}`}
          onPointerDown={event => {
            if (event.button !== 0 || painting.current) return
            const target = event.currentTarget.parentElement
            if (!target) return
            event.stopPropagation()
            const value = !clip.steps?.[(sourceStep + index) % patternLength]
            painting.current = { value, last: index, pointerId: event.pointerId, target }
            projectActions.beginEdit()
            target.setPointerCapture(event.pointerId)
            paint(index, value)
          }}
          onClick={event => {
            if (event.detail !== 0) return
            projectActions.beginEdit()
            paint(index, !clip.steps?.[(sourceStep + index) % patternLength])
            projectActions.endEdit()
          }}
        />
      ))}
    </div>
  )
}
