import { useCallback, useLayoutEffect, useMemo, useRef } from "react"

/**
 * Applies a divider drag's latest size from inside the pointer handler.
 *
 * It used to wait for the next animation frame, coalescing moves within it. That frame callback
 * runs after the draw it belongs to, so each move was committed one frame late and drawn one
 * frame after that: about two frames between the hand and the screen. Native pointer moves already
 * arrive at most once per frame, so committing each one directly loses nothing and lands the new
 * size in the very next draw. Release and restore therefore have nothing pending.
 */
export function useResizeCommit<T>(commit: (value: T) => void) {
  const latest = useRef(commit)
  useLayoutEffect(() => {
    latest.current = commit
  }, [commit])
  const schedule = useCallback((value: T) => latest.current(value), [])
  const settle = useCallback(() => {}, [])
  return useMemo(() => ({ schedule, flush: settle, cancel: settle }), [schedule, settle])
}
