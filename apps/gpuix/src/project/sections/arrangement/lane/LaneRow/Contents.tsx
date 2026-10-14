import { useMemo } from "react"
import { useTheme } from "../../../../../shared/theme/ThemeProvider"
import { sx } from "../../../../../shared/theme/style"
import { colorMix } from "../../../../../shared/theme/color-mix"
import { TRACK_TITLE_HEIGHT } from "../../../../layout"
import { projectTrackGroups } from "../../../../model/track-groups"
import { gridLines } from "../../core/rulers/grid-lines"
import type { ArrangementScene } from "../../core/scene"
import { visibleClipCards } from "../render-projection"
import type { TrackRow } from "../../core/layout"
import type { PeakReader } from "../PeakReader"
import { ClipCardView } from "../ClipCard"
import { resolveLaneColor } from "../appearance"
import { AutomationLayer } from "../AutomationLayer"

export function LaneContents({
  row,
  scene,
  automationMode,
  readPeaks,
  onActivate,
}: {
  row: TrackRow
  scene: ArrangementScene
  automationMode: boolean
  readPeaks: PeakReader
  onActivate: (id: string) => void
}) {
  const theme = useTheme()
  const grid = useMemo(() => gridLines(scene), [scene])
  const groups = useMemo(() => projectTrackGroups(scene.tracks), [scene.tracks])
  const selection = scene.timeSelection
  return (
    <div
      testId={`lane-row-content-${row.track.id}`}
      style={sx({
        position: "relative",
        width: scene.viewport.width,
        height: row.height,
        overflow: "hidden",
        pointerEvents: "none",
        backgroundColor: scene.selectedTrackIds.has(row.track.id)
          ? theme.colors.arrangementSurfaceSelected
          : theme.colors.editorShell,
      })}
    >
      {grid.map(line => (
        <div
          key={line.bar}
          aria-hidden
          style={sx({
            position: "absolute",
            left: line.x,
            top: 0,
            width: 1,
            height: row.height,
            backgroundColor: theme.colors.border,
            opacity: line.kind === "major" ? 1 : 0.5,
            pointerEvents: "none",
          })}
        />
      ))}
      {row.track.kind === "group" &&
        row.track.collapsed &&
        (groups.leafDescendantsByGroupId.get(row.track.id) ?? []).flatMap(track =>
          track.clips.map(clip => {
            const left = (clip.startBar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX
            const right = left + clip.lengthBars * scene.viewport.pxPerBar
            if (right <= 0 || left >= scene.viewport.width) return null
            return (
              <div
                key={`${track.id}:${clip.id}`}
                aria-hidden
                style={sx({
                  position: "absolute",
                  left: Math.max(0, left),
                  top: 0,
                  width: Math.min(scene.viewport.width, right) - Math.max(0, left),
                  height: Math.min(TRACK_TITLE_HEIGHT, row.height),
                  backgroundColor: resolveLaneColor(clip.color ?? track.color, theme),
                  opacity: 0.85,
                  pointerEvents: "none",
                })}
              />
            )
          })
        )}
      <div
        style={sx({
          position: "absolute",
          left: 0,
          top: -row.top,
          width: scene.viewport.width,
          height: scene.viewport.height,
          pointerEvents: "none",
        })}
      >
        {visibleClipCards(scene, row, automationMode).map(card => (
          <ClipCardView
            key={`${card.ghost ? "ghost" : "source"}:${card.clip.id}`}
            card={card}
            track={row.track}
            viewportWidth={scene.viewport.width}
            numerator={scene.transport.numerator}
            grid={grid}
            automationMode={automationMode}
            readPeaks={readPeaks}
            onActivate={onActivate}
          />
        ))}
        {automationMode && <AutomationLayer scene={scene} trackId={row.track.id} />}
      </div>
      {selection &&
        selection.trackIds.includes(row.track.id) &&
        selection.endBar > selection.startBar && (
          <div
            aria-hidden
            style={sx({
              position: "absolute",
              left: (selection.startBar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX,
              top: 0,
              width: (selection.endBar - selection.startBar) * scene.viewport.pxPerBar,
              height: row.height,
              backgroundColor: colorMix(theme.colors.primary, 20, "transparent"),
              pointerEvents: "none",
            })}
          />
        )}
    </div>
  )
}
