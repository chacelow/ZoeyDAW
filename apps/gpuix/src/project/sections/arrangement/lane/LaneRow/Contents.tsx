import { useMemo } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { TRACK_TITLE_HEIGHT } from "@/project/layout"
import { projectTrackGroups } from "@/project/model/track-groups"
import { patternRegions } from "../../core/rulers/grid-lines"
import type { ArrangementScene } from "../../core/scene"
import { visibleClipCards } from "../render-projection"
import type { TrackRow } from "../../core/layout"
import type { PeakReader } from "@/project/model/backend"
import { ClipCardView } from "../ClipCard"
import { resolveContentColor } from "@/shared/theme/content-color"
import { AutomationLayer } from "../AutomationLayer"
import { createClipCardProjection, createGridProjection } from "../clip-card-projection"

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
  const projectGrid = useMemo(createGridProjection, [])
  const projectCards = useMemo(createClipCardProjection, [])
  const grid = projectGrid(scene)
  const localRow = useMemo(
    () => ({ track: row.track, top: 0, height: row.height }),
    [row.track, row.height]
  )
  const cards = projectCards(scene, localRow, automationMode)
  const regions = useMemo(() => patternRegions(scene), [scene])
  const groups = useMemo(() => projectTrackGroups(scene.tracks), [scene.tracks])
  const descendants = groups.leafDescendantsByGroupId.get(row.track.id)
  const groupPitch = descendants?.length
    ? Math.max(
        0,
        Math.min(TRACK_TITLE_HEIGHT, row.height) - theme.project.arrangementGroupPreviewInset * 2
      ) / descendants.length
    : 0
  const groupBandHeight = Math.max(
    theme.project.arrangementGroupPreviewBandMinHeight,
    Math.min(
      theme.project.arrangementGroupPreviewBandMaxHeight,
      groupPitch - theme.project.arrangementGroupPreviewBandGap
    )
  )
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
        backgroundColor: theme.colors.arrangementSurface,
      })}
    >
      {regions
        .filter(region => region.alternate && region.width > 0)
        .map(region => (
          <div
            key={region.bar}
            aria-hidden
            style={sx({
              position: "absolute",
              left: region.left,
              top: 0,
              width: region.width,
              height: row.height,
              backgroundColor: theme.colors.arrangementSurfaceAlt,
              pointerEvents: "none",
            })}
          />
        ))}
      {scene.selectedTrackIds.has(row.track.id) && (
        <div
          aria-hidden
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width: scene.viewport.width,
            height: row.height,
            backgroundColor: theme.colors.arrangementSurfaceSelected,
            opacity: 0.5,
            pointerEvents: "none",
          })}
        />
      )}
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
            backgroundColor: theme.colors.arrangementLine,
            opacity: line.kind === "major" ? 1 : 0.5,
            pointerEvents: "none",
          })}
        />
      ))}
      {row.track.kind === "group" &&
        row.track.collapsed &&
        descendants?.flatMap((track, index) =>
          visibleClipCards(scene, { track, top: row.top, height: row.height }, automationMode).map(
            card => {
              const clip = card.clip
              const left = Math.max(0, card.geometry.left)
              const right = Math.min(scene.viewport.width, card.geometry.left + card.geometry.width)
              if (right <= left) return null
              return (
                <div
                  key={`${track.id}:${card.ghost ? "ghost" : "source"}:${clip.id}`}
                  testId={`group-clip-${track.id}-${card.ghost ? "ghost" : "source"}-${clip.id}`}
                  aria-hidden
                  style={sx({
                    position: "absolute",
                    left,
                    top:
                      theme.project.arrangementGroupPreviewInset +
                      index * groupPitch +
                      Math.max(0, (groupPitch - groupBandHeight) / 2),
                    width: right - left,
                    height: groupBandHeight,
                    backgroundColor: resolveContentColor(clip.color ?? track.color, theme.colors),
                    opacity: 0.85,
                    pointerEvents: "none",
                  })}
                />
              )
            }
          )
        )}
      <div
        style={sx({
          position: "absolute",
          left: 0,
          top: 0,
          width: scene.viewport.width,
          height: row.height,
          pointerEvents: "none",
        })}
      >
        {cards.map(card => (
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
      </div>
      {automationMode && (
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
          <AutomationLayer scene={scene} trackId={row.track.id} />
        </div>
      )}
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
              backgroundColor: theme.colors.primary,
              opacity: 0.2,
              pointerEvents: "none",
            })}
          />
        )}
    </div>
  )
}
