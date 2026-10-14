import { useMemo, useRef } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { visibleTracks } from "@/project/model/types"
import { projectTrackGroups } from "@/project/model/track-groups"
import {
  arrangementBodyTop,
  arrangementBodyBottom,
  isPinnedTrack,
  layoutTrackRowsForViewport,
  pinnedTrackHeight,
} from "../../core/layout"
import { TrackLabelsProvider } from "../labels"
import { TrackTelemetryProvider } from "../meter/telemetry"
import { TrackRow } from "../Row"
import { GroupRails } from "../GroupRails"
import { trackFill } from "../track-color"
import { useTrackReorder } from "../Row/useTrackReorder"
import type { PublicInstance } from "@gpuix/react"
import type { ReactNode } from "react"
import type { TrackLabels } from "../labels"
import type { TelemetryReader } from "../meter/telemetry"
import type { ArrangementScene, ArrangementViewport } from "../../core/scene"
import type { TrackRow as TrackRowGeometry } from "../../core/layout"

export interface TrackRowsProps {
  readonly scene: ArrangementScene
  readonly viewport: ArrangementViewport
  readonly focusedTrackId: string | null
  readonly onFocusTrack: (id: string) => void
  readonly telemetry: TelemetryReader
  readonly renderLane: (row: TrackRowGeometry) => ReactNode
  readonly labels: TrackLabels
}

export function TrackRows({
  scene,
  viewport,
  focusedTrackId,
  onFocusTrack,
  telemetry,
  renderLane,
  labels,
}: TrackRowsProps) {
  const theme = useTheme()
  const container = useRef<PublicInstance | null>(null)
  const tracks = useMemo(() => visibleTracks([...scene.tracks]), [scene.tracks])
  const groups = useMemo(() => projectTrackGroups(scene.tracks), [scene.tracks])
  const rows = useMemo(
    () => layoutTrackRowsForViewport(tracks, viewport.scrollY, viewport.height),
    [tracks, viewport.scrollY, viewport.height]
  )
  const bodyTop = arrangementBodyTop()
  const bodyBottom = arrangementBodyBottom(viewport.height)
  const pinnedTop = bodyBottom - pinnedTrackHeight(tracks)
  const pinnedViewportTop = Math.max(bodyTop, pinnedTop)
  const visibility = useMemo(() => {
    const visibleRows = rows.filter(
      row =>
        row.top + row.height > (isPinnedTrack(row.track) ? pinnedViewportTop : bodyTop) &&
        row.top < (isPinnedTrack(row.track) ? bodyBottom : pinnedTop)
    )
    return { rows: visibleRows, ids: new Set(visibleRows.map(row => row.track.id)) }
  }, [rows, bodyTop, bodyBottom, pinnedTop, pinnedViewportTop])
  const reorder = useTrackReorder(visibility.rows, container)
  const normal = rows.filter(row => !isPinnedTrack(row.track))
  const pinned = rows.filter(row => isPinnedTrack(row.track))
  const laneWidth = Math.max(0, viewport.width - theme.project.controlsWidth)
  const drawRows = (
    input: readonly TrackRowGeometry[],
    offset: number,
    top: number,
    bottom: number
  ) => {
    const mounted = input.filter(
      row => visibility.ids.has(row.track.id) || row.track.id === focusedTrackId
    )
    return (
      <>
        {mounted.map(row => {
          const visible = visibility.ids.has(row.track.id)
          return (
            <div
              key={row.track.id}
              testId={`track-position-${row.track.id}`}
              style={{
                position: "absolute",
                top: row.top - offset,
                left: 0,
                right: 0,
                height: row.height,
              }}
            >
              <TrackRow
                row={row}
                viewport={viewport}
                rails={groups.railsByTrackId.get(row.track.id) ?? []}
                descendants={groups.leafDescendantsByGroupId.get(row.track.id) ?? []}
                lane={visible ? renderLane(row) : null}
                showLane={visible}
                onFocusTrack={onFocusTrack}
                dragHandlers={reorder.handlers(row.track)}
                dragging={reorder.draggingId === row.track.id}
                dropTarget={reorder.targetId === row.track.id}
              />
            </div>
          )
        })}
        {input
          .filter(row => row.track.kind === "group")
          .map(row => {
            let last = row
            for (const candidate of input) {
              if (
                groups.railsByTrackId
                  .get(candidate.track.id)
                  ?.some(rail => rail.group.id === row.track.id)
              )
                last = candidate
            }
            const height = last.top + last.height - row.top
            if (row.top + height <= top || row.top >= bottom) return null
            return (
              <div
                key={`frame-${row.track.id}`}
                aria-hidden="true"
                testId={`track-group-frame-${row.track.id}`}
                style={{
                  position: "absolute",
                  top: row.top - offset,
                  left: 0,
                  right: 0,
                  height,
                  borderWidth: 1,
                  borderColor: trackFill(row.track.color, theme),
                  pointerEvents: "none",
                }}
              />
            )
          })}
        {mounted.map(row => (
          <div
            key={`rails-${row.track.id}`}
            aria-hidden="true"
            style={{
              position: "absolute",
              top: row.top - offset,
              left: laneWidth,
              width: theme.project.identityWidth,
              height: row.height,
              pointerEvents: "none",
            }}
          >
            <GroupRails track={row.track} rails={groups.railsByTrackId.get(row.track.id) ?? []} />
          </div>
        ))}
      </>
    )
  }
  return (
    <TrackLabelsProvider labels={labels}>
      <TrackTelemetryProvider telemetry={telemetry}>
        <div
          ref={container}
          role="group"
          aria-label={labels.trackLane}
          testId="track-rows"
          style={{
            position: "relative",
            width: viewport.width,
            height: viewport.height,
            backgroundColor: theme.colors.arrangementSurfaceAlt,
            overflow: "hidden",
          }}
        >
          <div
            testId="track-scrollable-viewport"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: bodyTop,
              height: Math.max(0, pinnedTop - bodyTop),
              overflow: "hidden",
            }}
          >
            {drawRows(normal, bodyTop, bodyTop, pinnedTop)}
          </div>
          <div
            testId="track-pinned-viewport"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: pinnedViewportTop,
              height: Math.max(0, bodyBottom - pinnedViewportTop),
              overflow: "hidden",
            }}
          >
            {drawRows(pinned, pinnedViewportTop, pinnedViewportTop, bodyBottom)}
          </div>
        </div>
      </TrackTelemetryProvider>
    </TrackLabelsProvider>
  )
}
