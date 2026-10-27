import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { beginAutomationGesture, changeAutomationGesture, endAutomationGesture } from "./context"
import { useProjectEditGesture } from "./useProjectEditGesture"
import type { AutomationTarget, ProjectEditToken } from "@zoeydaw/project-core/types"
import { useProjectState } from "./read-model"
import { positionToBar } from "@zoeydaw/project-core/types"
import { sameAutomationTarget } from "@zoeydaw/project-core/automation-target"
import {
  automationSourceValue,
  automationValueAt,
  normalizedAutomationValue,
} from "@zoeydaw/project-core/automation-curve"

export function useAutomationGesture(
  trackId: string,
  target: AutomationTarget,
  onChange: (value: number) => void,
  manualValue: number
) {
  const ordinary = useProjectEditGesture(onChange)
  const epoch = useProjectState(state => state.session.editEpoch)
  const value = useProjectState(state => {
    const lane = state.document.tracks
      .find(track => track.id === trackId)
      ?.automation.find(lane => sameAutomationTarget(lane.target, target))
    return lane?.points.length
      ? automationSourceValue(
          target,
          automationValueAt(
            lane.points,
            positionToBar(state.session.position, state.document.transport.numerator),
            normalizedAutomationValue(target, manualValue)
          )
        )
      : manualValue
  })
  const recording = useRef<ProjectEditToken | null>(null)
  const started = useRef(false)
  const decided = useRef(false)
  const targetRef = useRef(target)
  useLayoutEffect(() => {
    targetRef.current = target
  }, [target])
  const gesture = useMemo(
    () => ({
      onGestureStart() {
        if (useProjectState.getState().session.editEpoch !== epoch) return
        started.current = true
        decided.current = false
      },
      onChange(value: number) {
        if (!started.current) return
        if (!decided.current) {
          decided.current = true
          recording.current = beginAutomationGesture(trackId, targetRef.current, value)
          if (!recording.current) ordinary.onGestureStart()
        }
        if (recording.current) changeAutomationGesture(recording.current, value)
        else ordinary.onChange(value)
      },
      onGestureEnd() {
        if (recording.current) endAutomationGesture(recording.current)
        else ordinary.onGestureEnd()
        recording.current = null
        started.current = false
      },
      onGestureCancel() {
        if (recording.current) endAutomationGesture(recording.current, true)
        else ordinary.onGestureCancel()
        recording.current = null
        started.current = false
      },
    }),
    [trackId, ordinary, epoch]
  )
  useEffect(() => () => gesture.onGestureCancel(), [gesture])
  return { ...gesture, value }
}
