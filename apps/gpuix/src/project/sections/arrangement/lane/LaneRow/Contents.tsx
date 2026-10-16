import { MINOR_GRID_OPACITY } from "../../core/rulers/grid-quads"
import { useLayoutEffect, useMemo } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { TRACK_TITLE_HEIGHT } from "@/project/layout"
import { projectTrackGroups } from "@/project/model/track-groups"
import type { ArrangementScene } from "../../core/scene"
import { visibleClipCards } from "../render-projection"
import type { TrackRow } from "../../core/layout"
import type { PeakReader } from "@/project/model/backend"
import { ClipCardView } from "../ClipCard"
import { resolveContentColor } from "@/shared/theme/content-color"
import { AutomationLayer } from "../AutomationLayer"
import { createClipCardProjection, createGridProjection } from "../clip-card-projection"
import { useGridQuads } from "../GridQuads"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"

export function LaneContents({
  row,
  scene,
  automationMode,
  readPeaks,
}: {
  row: TrackRow
  scene: ArrangementScene
  automationMode: boolean
  readPeaks: PeakReader
}) {
  const theme = useTheme()
  const projectGrid = useMemo(createGridProjection, [])
  const projectCards = useMemo(createClipCardProjection, [])
  const { lines: grid, regions } = projectGrid(scene)
  const localRow = useMemo(
    () => ({ track: row.track, top: 0, height: row.height }),
    [row.track, row.height]
  )
  const cards = projectCards(scene, localRow, automationMode)
  const backgroundBatch = useQuadBatch()
  const backgroundQuads = useMemo(() => {
    let count = 0
    for (const region of regions) if (region.alternate && region.width > 0) count++
    const values = new Float32Array(count * 4)
    let offset = 0
    for (const region of regions) {
      if (!region.alternate || region.width <= 0) continue
      values[offset] = region.left
      values[offset + 1] = 0
      values[offset + 2] = region.width
      values[offset + 3] = row.height
      offset += 4
    }
    return values
  }, [regions, row.height])
  useLayoutEffect(() => {
    backgroundBatch.setQuads(backgroundQuads)
  }, [backgroundBatch, backgroundQuads])
  const gridBatch = useGridQuads(grid, 0, scene.viewport.width, row.height, false)
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
      {backgroundQuads.length > 0 && (
        <QuadBatch
          ref={backgroundBatch.ref}
          aria-hidden
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width: scene.viewport.width,
            height: row.height,
            color: theme.colors.arrangementSurfaceAlt,
            pointerEvents: "none",
          })}
        />
      )}
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
      {gridBatch.hasMajor && (
        <QuadBatch
          ref={gridBatch.majorRef}
          aria-hidden
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width: scene.viewport.width,
            height: row.height,
            color: theme.colors.arrangementLine,
            opacity: 1,
            pointerEvents: "none",
          })}
        />
      )}
      {gridBatch.hasMinor && (
        <QuadBatch
          ref={gridBatch.minorRef}
          aria-hidden
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width: scene.viewport.width,
            height: row.height,
            color: theme.colors.arrangementLine,
            opacity: MINOR_GRID_OPACITY,
            pointerEvents: "none",
          })}
        />
      )}
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
            trackColor={row.track.color}
            viewportWidth={scene.viewport.width}
            numerator={scene.transport.numerator}
            automationMode={automationMode}
            readPeaks={readPeaks}
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
