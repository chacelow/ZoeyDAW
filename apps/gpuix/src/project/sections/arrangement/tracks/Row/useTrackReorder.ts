import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { PanelEnvironmentContext } from "../../../../../ui/panels/PanelEnvironment"
import { readOuterBounds } from "../../../../../ui/controls/useMeasuredTextWidth"
import { projectActions, useProjectState } from "../../../../adapters"
import { dragStarted } from "../../core/interactions/layers"
import type { Props, PublicInstance } from "@gpuix/react"
import type { RefObject } from "react"
import type { TrackRow } from "../../core/layout"
import type { Track } from "../../../../model/types"

export function useTrackReorder(
  rows: readonly TrackRow[],
  container: RefObject<PublicInstance | null>
) {
  const { renderer } = useGpuix()
  const { subscribeWindowActive } = useContext(PanelEnvironmentContext)
  const epoch = useProjectState(state => state.session.editEpoch)
  const anchor = useRef<{
    id: string
    x: number
    y: number
    moved: boolean
    target: string | null
  } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const cancel = useCallback(() => {
    anchor.current = null
    setDraggingId(null)
    setTargetId(null)
  }, [])
  useEffect(() => {
    cancel()
    return cancel
  }, [epoch, cancel])
  useEffect(
    () =>
      subscribeWindowActive?.(active => {
        if (!active) cancel()
      }),
    [subscribeWindowActive, cancel]
  )
  return {
    draggingId,
    targetId,
    handlers(track: Track): Pick<Props, "onMouseDown" | "onMouseMove" | "onMouseUp" | "onKeyDown"> {
      return {
        onMouseDown(event) {
          if (
            track.kind === "main" ||
            event.button !== 0 ||
            event.x === undefined ||
            event.y === undefined
          )
            return
          anchor.current = { id: track.id, x: event.x, y: event.y, moved: false, target: null }
        },
        onMouseMove(event) {
          const start = anchor.current
          if (!start || event.x === undefined || event.y === undefined) return
          if (event.pressedButton !== 0) {
            cancel()
            return
          }
          if (!start.moved && !dragStarted(start, { x: event.x, y: event.y })) return
          start.moved = true
          const bounds = readOuterBounds(renderer, container.current)
          const target =
            bounds && event.x >= bounds.x && event.x <= bounds.x + bounds.width
              ? rows.find(
                  row =>
                    event.y !== undefined &&
                    event.y - bounds.y >= row.top &&
                    event.y - bounds.y < row.top + row.height
                )
              : undefined
          start.target =
            target && target.track.id !== start.id && target.track.kind !== "main"
              ? target.track.id
              : null
          setDraggingId(start.id)
          setTargetId(start.target)
        },
        onMouseUp() {
          const start = anchor.current
          cancel()
          if (start?.moved && start.target) projectActions.reorderTrack(start.id, start.target)
        },
        onKeyDown(event) {
          if (event.key === "escape") cancel()
        },
      }
    },
  }
}
