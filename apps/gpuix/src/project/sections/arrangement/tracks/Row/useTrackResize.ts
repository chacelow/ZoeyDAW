import { useCallback, useContext, useEffect, useRef } from "react"
import { PanelEnvironmentContext } from "../../../../../ui/panels/PanelEnvironment"
import { projectActions, useProjectEditGesture } from "../../../../adapters"
import { resizeTrackHeight, TRACK_REVEAL_THRESHOLD, TRACK_RESIZE_STEP } from "../../../../layout"
import type { Props } from "@gpuix/react"
import type { Track } from "../../../../model/types"

type HeightPatch = Pick<Track, "collapsed" | "heightPx">

export function useTrackResize(
  track: Track
): Pick<Props, "onMouseDown" | "onMouseMove" | "onMouseUp" | "onKeyDown" | "onBlur"> {
  const gesture = useProjectEditGesture((patch: HeightPatch) =>
    projectActions.updateTrack(track.id, patch)
  )
  const { subscribeWindowActive } = useContext(PanelEnvironmentContext)
  const anchor = useRef<{ y: number; track: Track; last: HeightPatch } | null>(null)
  const pinned = track.kind === "main" || track.kind === "return"
  const cancel = useCallback(() => {
    anchor.current = null
    gesture.onGestureCancel()
  }, [gesture])
  useEffect(() => cancel, [cancel])
  useEffect(
    () =>
      subscribeWindowActive?.(active => {
        if (!active) cancel()
      }),
    [subscribeWindowActive, cancel]
  )
  return {
    onMouseDown(event) {
      if (event.button !== 0 || event.y === undefined) return
      anchor.current = {
        y: event.y,
        track,
        last: { collapsed: track.collapsed, heightPx: track.heightPx },
      }
      gesture.onGestureStart()
    },
    onMouseMove(event) {
      const start = anchor.current
      if (!start || event.y === undefined) return
      if (event.pressedButton !== 0) {
        cancel()
        return
      }
      const next = resizeTrackHeight(start.track, (event.y - start.y) * (pinned ? -1 : 1))
      if (next.collapsed === start.last.collapsed && next.heightPx === start.last.heightPx) return
      start.last = next
      gesture.onChange(next)
    },
    onMouseUp() {
      if (!anchor.current) return
      anchor.current = null
      gesture.onGestureEnd()
    },
    onBlur: cancel,
    onKeyDown(event) {
      if (event.key === "escape") {
        cancel()
        return
      }
      if (
        event.key !== "up" &&
        event.key !== "down" &&
        event.key !== "arrowup" &&
        event.key !== "arrowdown"
      )
        return
      const up = event.key === "up" || event.key === "arrowup"
      projectActions.updateTrack(
        track.id,
        resizeTrackHeight(
          track,
          up === pinned
            ? track.collapsed
              ? TRACK_REVEAL_THRESHOLD
              : TRACK_RESIZE_STEP
            : -TRACK_RESIZE_STEP
        )
      )
    },
  }
}
