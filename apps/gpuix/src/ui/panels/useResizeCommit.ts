import { useContext, useEffect, useLayoutEffect, useRef } from "react"
import { PanelEnvironmentContext } from "./PanelEnvironment"

export function useResizeCommit<T>(commit: (value: T) => void) {
  const { scheduleFrame } = useContext(PanelEnvironmentContext)
  const latest = useRef(commit)
  const pending = useRef<{ value: T } | null>(null)
  const cancelFrame = useRef<(() => void) | null>(null)
  useLayoutEffect(() => { latest.current = commit }, [commit])
  useEffect(() => () => { cancelFrame.current?.() }, [])
  const cancel = () => {
    cancelFrame.current?.()
    cancelFrame.current = null
    pending.current = null
  }
  const flush = () => {
    const next = pending.current
    cancel()
    if (next) latest.current(next.value)
  }
  return {
    schedule: (value: T) => {
      pending.current = { value }
      if (!scheduleFrame) { flush(); return }
      if (!cancelFrame.current) cancelFrame.current = scheduleFrame(flush)
    },
    flush,
    cancel,
  }
}
