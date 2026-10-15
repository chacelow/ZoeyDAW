import { useLayoutEffect, useMemo, useState } from "react"
import { Shape } from "@/shared/svg/Shape"
import { polygonPath } from "@/shared/svg/paths"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { alignmentBar } from "../../core/clip-alignment"
import { arrangementBodyBottom, arrangementBodyTop } from "../../core/layout"
import type { ArrangementScene, ArrangementViewport } from "../../core/scene"
import { useProjectState } from "@/project/adapters"
import { useAnimationFrame } from "@/platform/frame"
import { visibleRows } from "../render-projection"

export interface LaneOverlayProps {
  scene: ArrangementScene
  viewport: ArrangementViewport
  transportBar: () => number
}

export function LaneOverlay({ scene, viewport, transportBar }: LaneOverlayProps) {
  const theme = useTheme()
  const [position, setPosition] = useState(transportBar)
  useLayoutEffect(() => {
    setPosition(transportBar())
  }, [transportBar, scene.playback.playing])
  useAnimationFrame(() => {
    setPosition(transportBar())
  }, scene.playback.playing)
  const insertionPath = useMemo(
    () =>
      polygonPath([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 1 },
      ]),
    []
  )
  const recording = useProjectState(state => state.session.recording)
  const top = arrangementBodyTop()
  const bottom = arrangementBodyBottom(viewport.height)
  const alignment = alignmentBar(scene)
  const anchor = scene.playback.insertionPoint
  const projected = scene.viewport === viewport ? scene : { ...scene, viewport }
  const row = anchor
    ? visibleRows(projected).find(item => item.track.id === anchor.trackId)
    : undefined
  const playheadX = (position - 1) * viewport.pxPerBar - viewport.scrollX
  const insertionX = anchor ? (anchor.bar - 1) * viewport.pxPerBar - viewport.scrollX : -1
  const alignmentX =
    alignment === null ? -1 : (alignment - 1) * viewport.pxPerBar - viewport.scrollX
  return (
    <div
      aria-hidden
      style={sx({
        position: "absolute",
        left: 0,
        top: 0,
        width: viewport.width,
        height: viewport.height,
        overflow: "hidden",
        pointerEvents: "none",
      })}
    >
      {!scene.playback.playing &&
        anchor &&
        row &&
        insertionX >= 0 &&
        insertionX < viewport.width && (
          <>
            <div
              testId="insertion-point"
              aria-hidden
              style={sx({
                position: "absolute",
                left: insertionX,
                top: row.clipTop,
                width: 1,
                height: row.clipBottom - row.clipTop,
                backgroundColor: theme.colors.primary,
                pointerEvents: "none",
              })}
            />
            <Shape
              width={theme.project.arrangementInsertionTriangleWidth}
              height={theme.project.arrangementInsertionTriangleHeight}
              viewBox="0 0 2 1"
              paths={[{ d: insertionPath, fill: true }]}
              color={theme.colors.primary}
              style={sx({
                position: "absolute",
                left: insertionX - theme.project.arrangementInsertionTriangleWidth / 2,
                top: top - theme.project.arrangementInsertionTriangleTopOffset,
                pointerEvents: "none",
              })}
            />
          </>
        )}
      {scene.playback.playing && playheadX >= 0 && playheadX < viewport.width && (
        <div
          testId="transport-playhead"
          aria-hidden
          style={sx({
            position: "absolute",
            left: playheadX,
            top,
            width: 1,
            height: bottom - top,
            backgroundColor: recording ? theme.colors.arrangementAutomation : theme.colors.primary,
            pointerEvents: "none",
          })}
        />
      )}
      {alignmentX >= 0 && alignmentX < viewport.width && (
        <div
          testId="clip-alignment"
          aria-hidden
          style={sx({
            position: "absolute",
            left: alignmentX,
            top,
            width: 1,
            height: bottom - top,
            backgroundColor: theme.colors.mutedForeground,
            pointerEvents: "none",
          })}
        />
      )}
    </div>
  )
}
