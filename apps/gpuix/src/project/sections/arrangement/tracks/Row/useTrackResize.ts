import { useCallback, useContext, useEffect, useRef } from "react"
import { PanelEnvironmentContext } from "@/ui/panels/PanelEnvironment"
import { projectActions, useProjectEditGesture } from "@/project/adapters"
import { resizeTrackHeight } from "@/project/layout"
import type { TrackGeometry } from "@/project/layout"
import type { Props } from "@gpuix/react"
import type { Track } from "@/project/model/types"

type HeightPatch = Pick<Track, "collapsed" | "heightPx">

export function useTrackResize(
  track: Track,
  onCaptureChange: (captured: boolean) => void,
  geometry: TrackGeometry
): Pick<Props, "onMouseDown" | "onMouseMove" | "onMouseUp" | "onKeyDown" | "onBlur"> {
  const gesture = useProjectEditGesture((patch: HeightPatch) =>
    projectActions.updateTrack(track.id, patch)
  )
  const { subscribeWindowActive } = useContext(PanelEnvironmentContext)
  const anchor = useRef<{ y: number; track: Track; last: HeightPatch } | null>(null)
  const pinned = track.kind === "main" || track.kind === "return"
  const cancel = useCallback(() => {
    const captured = anchor.current !== null
    anchor.current = null
    gesture.onGestureCancel()
    if (captured) onCaptureChange(false)
  }, [gesture, onCaptureChange])
  useEffect(() => cancel, [cancel, geometry])
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
      onCaptureChange(true)
    },
    onMouseMove(event) {
      const start = anchor.current
      if (!start || event.y === undefined) return
      if (event.pressedButton !== 0) {
        cancel()
        return
      }
      const next = resizeTrackHeight(start.track, (event.y - start.y) * (pinned ? -1 : 1), geometry)
      if (next.collapsed === start.last.collapsed && next.heightPx === start.last.heightPx) return
      start.last = next
      gesture.onChange(next)
    },
    onMouseUp() {
      if (!anchor.current) return
      anchor.current = null
      gesture.onGestureEnd()
      onCaptureChange(false)
    },
    onBlur: cancel,
    onKeyDown(event) {
      if (event.key === "escape") {
        if (!anchor.current) return
        event.preventDefault()
        event.stopPropagation()
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
      event.preventDefault()
      event.stopPropagation()
      const up = event.key === "up" || event.key === "arrowup"
      projectActions.updateTrack(
        track.id,
        resizeTrackHeight(
          track,
          up === pinned
            ? track.collapsed
              ? geometry.revealThreshold
              : geometry.resizeStep
            : -geometry.resizeStep,
          geometry
        )
      )
    },
  }
}
