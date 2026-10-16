import { useCallback, useContext, useEffect, useLayoutEffect, useRef } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload } from "@gpuix/react"
import { PanelEnvironmentContext } from "./PanelEnvironment"

export function useDividerDrag<Snapshot>({
  orientation,
  disabled,
  start,
  move,
  finish,
  restore,
}: {
  orientation: "vertical" | "horizontal"
  disabled?: boolean
  start: () => Snapshot
  move: (snapshot: Snapshot, delta: number) => void
  finish?: () => void
  restore: (snapshot: Snapshot) => void
}) {
  const { renderer } = useGpuix()
  const { subscribeWindowActive } = useContext(PanelEnvironmentContext)
  const onRestore = useRef(restore)
  const onFinish = useRef(finish)
  useLayoutEffect(() => {
    onRestore.current = restore
    onFinish.current = finish
  }, [restore, finish])
  const drag = useRef<{
    origin: number
    snapshot: Snapshot
    elementId: number
  } | null>(null)
  const position = (event: EventPayload) => (orientation === "vertical" ? event.x : event.y)
  const cancel = useCallback(() => {
    const active = drag.current
    drag.current = null
    if (!active) return false
    onRestore.current(active.snapshot)
    return true
  }, [])
  const complete = useCallback(() => {
    const active = drag.current
    drag.current = null
    if (active) onFinish.current?.()
  }, [])
  useLayoutEffect(() => {
    if (disabled) complete()
  }, [disabled, complete])
  const checkFocus = () => {
    const active = drag.current
    if (
      active &&
      renderer?.getFocusedElementId &&
      renderer.getFocusedElementId() !== active.elementId
    )
      cancel()
  }
  const update = (event: EventPayload) => {
    checkFocus()
    const active = drag.current
    const current = position(event)
    if (active && current !== undefined) move(active.snapshot, current - active.origin)
  }
  useEffect(
    () =>
      subscribeWindowActive?.(active => {
        if (!active) cancel()
      }),
    [subscribeWindowActive, cancel]
  )
  useEffect(() => complete, [complete])
  return {
    cancel,
    onMouseDown: (event: EventPayload) => {
      if (disabled || (event.button !== undefined && event.button !== 0)) return
      cancel()
      drag.current = {
        origin: position(event) ?? 0,
        snapshot: start(),
        elementId: event.elementId,
      }
    },
    onMouseMove: update,
    onMouseUp: (event: EventPayload) => {
      if (!drag.current) return
      update(event)
      complete()
    },
    onBlur: cancel,
  }
}
