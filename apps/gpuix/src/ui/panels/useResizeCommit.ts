import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { PanelEnvironmentContext } from "./PanelEnvironment"

export function useResizeCommit<T>(commit: (value: T) => void) {
  const { scheduleFrame } = useContext(PanelEnvironmentContext)
  const latest = useRef(commit)
  const pending = useRef<{ value: T } | null>(null)
  const cancelFrame = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    latest.current = commit
  }, [commit])
  useEffect(
    () => () => {
      cancelFrame.current?.()
    },
    []
  )
  const cancel = useCallback(() => {
    cancelFrame.current?.()
    cancelFrame.current = null
    pending.current = null
  }, [])
  const flush = useCallback(() => {
    const next = pending.current
    cancel()
    if (next) latest.current(next.value)
  }, [cancel])
  const schedule = useCallback(
    (value: T) => {
      pending.current = { value }
      if (!scheduleFrame) {
        flush()
        return
      }
      if (!cancelFrame.current) cancelFrame.current = scheduleFrame(flush)
    },
    [scheduleFrame, flush]
  )
  return useMemo(() => ({ schedule, flush, cancel }), [schedule, flush, cancel])
}
