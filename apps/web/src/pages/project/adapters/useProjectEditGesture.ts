import { useEffect, useId, useLayoutEffect, useMemo, useRef } from "react"
import { useProjectState } from "@/pages/project/stores/useProjectState"
import { beginEdit, cancelEdit, endEdit, isCurrentEdit } from "./context"
import type { ProjectEditToken } from "@/pages/project/model/types"

export function useProjectEditGesture<T>(onChange: (value: T) => void): {
  onGestureStart: () => void
  onGestureEnd: () => void
  onGestureCancel: () => void
  onChange: (value: T) => void
} {
  const owner = useId()
  const epoch = useProjectState(state => state.session.editEpoch)
  const change = useRef(onChange)
  const token = useRef<ProjectEditToken | null>(null)
  useLayoutEffect(() => {
    change.current = onChange
  }, [onChange])
  const gesture = useMemo(() => {
    return {
      onChange: (value: T) => {
        const active = token.current
        if (active?.sessionId === epoch && isCurrentEdit(active)) change.current(value)
      },
      onGestureStart: () => {
        if (
          token.current?.sessionId === epoch ||
          useProjectState.getState().session.editEpoch !== epoch
        )
          return
        token.current = beginEdit(owner)
      },
      onGestureEnd: () => {
        const active = token.current
        if (active?.sessionId !== epoch) return
        token.current = null
        endEdit(active)
      },
      onGestureCancel: () => {
        const active = token.current
        if (active?.sessionId !== epoch) return
        token.current = null
        cancelEdit(active)
      },
    }
  }, [owner, epoch])
  useEffect(() => () => gesture.onGestureCancel(), [gesture])
  return gesture
}
