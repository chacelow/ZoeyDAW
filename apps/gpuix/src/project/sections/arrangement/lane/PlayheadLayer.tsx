import { useTheme } from "../../../../shared/theme/ThemeProvider"
import { sx } from "../../../../shared/theme/style"
import { alignmentBar } from "../core/clip-alignment"
import { arrangementBodyBottom, arrangementBodyTop } from "../core/layout"
import type { ArrangementScene } from "../core/scene"
import { visibleRows } from "./render-projection"

export function PlayheadLayer({
  scene,
  transportBar,
}: {
  scene: ArrangementScene
  transportBar: number
}) {
  const theme = useTheme()
  const top = arrangementBodyTop()
  const bottom = arrangementBodyBottom(scene.viewport.height)
  const alignment = alignmentBar(scene)
  const anchor = scene.playback.insertionPoint
  const row = anchor ? visibleRows(scene).find(item => item.track.id === anchor.trackId) : undefined
  const playheadX = (transportBar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX
  const insertionX = anchor
    ? (anchor.bar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX
    : -1
  const alignmentX =
    alignment === null ? -1 : (alignment - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX
  return (
    <>
      {!scene.playback.playing &&
        anchor &&
        row &&
        insertionX >= 0 &&
        insertionX < scene.viewport.width && (
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
            <svg
              source={
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><path d="M0,0 L2,0 L1,1 Z"/></svg>'
              }
              aria-hidden
              style={sx({
                position: "absolute",
                left: insertionX - theme.control["--spacing-control-track-gap"],
                top: top - theme.project.groupRailWidth,
                width: theme.control["--spacing-control-track-gap"] * 2,
                height: theme.project.groupRailWidth - 1,
                color: theme.colors.primary,
                pointerEvents: "none",
              })}
            />
          </>
        )}
      {scene.playback.playing && playheadX >= 0 && playheadX < scene.viewport.width && (
        <div
          testId="transport-playhead"
          aria-hidden
          style={sx({
            position: "absolute",
            left: playheadX,
            top,
            width: 1,
            height: bottom - top,
            backgroundColor: theme.colors.primary,
            pointerEvents: "none",
          })}
        />
      )}
      {alignmentX >= 0 && alignmentX < scene.viewport.width && (
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
    </>
  )
}
