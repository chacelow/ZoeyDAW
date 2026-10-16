import { useMemo, useRef } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { projectTrackGroups } from "@/project/model/track-groups"
import { isPinnedTrack } from "../../core/layout"
import { useTrackRowLayout } from "./useTrackRowLayout"
import { TrackLabelsProvider } from "../labels"
import { TrackTelemetryProvider } from "../meter/telemetry"
import { TrackRow } from "../Row"
import { GroupRails } from "../GroupRails"
import { contentFill } from "@/shared/theme/content-color"
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
  const groups = useMemo(() => projectTrackGroups(scene.tracks), [scene.tracks])
  const { rows, bodyTop, bodyBottom, pinnedTop, pinnedViewportTop, visibility } = useTrackRowLayout(
    scene,
    viewport
  )
  const visibleGroupIds = useMemo(() => {
    const ids = new Set<string>()
    for (const row of visibility.rows) {
      if (row.track.kind === "group") ids.add(row.track.id)
      for (const rail of groups.railsByTrackId.get(row.track.id) ?? []) ids.add(rail.group.id)
    }
    return ids
  }, [visibility.rows, groups])
  const groupEnds = useMemo(() => {
    const lastRows = new Map<string, TrackRowGeometry>()
    for (const row of rows) {
      if (row.track.kind === "group" && visibleGroupIds.has(row.track.id))
        lastRows.set(row.track.id, row)
      for (const rail of groups.railsByTrackId.get(row.track.id) ?? []) {
        if (visibleGroupIds.has(rail.group.id)) lastRows.set(rail.group.id, row)
      }
    }
    return lastRows
  }, [rows, groups, visibleGroupIds])
  const reorder = useTrackReorder(visibility.rows, container)
  const normal = rows.filter(row => !isPinnedTrack(row.track))
  const pinned = rows.filter(row => isPinnedTrack(row.track))
  const laneWidth = viewport.width
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
                rails={groups.railsByTrackId.get(row.track.id) ?? []}
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
          .filter(row => row.track.kind === "group" && visibleGroupIds.has(row.track.id))
          .map(row => {
            const last = groupEnds.get(row.track.id) ?? row
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
                  borderColor: contentFill(row.track.color, theme.colors),
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
            width: viewport.width + theme.project.controlsWidth,
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
