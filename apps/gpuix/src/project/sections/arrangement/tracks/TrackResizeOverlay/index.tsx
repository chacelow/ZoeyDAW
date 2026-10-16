import { useTheme } from "@/shared/theme/ThemeProvider"
import { COLLAPSED_TRACK_HEIGHT, MAX_TRACK_HEIGHT } from "@/project/layout"
import { isPinnedTrack } from "../../core/layout"
import { useTrackResize } from "../Row/useTrackResize"
import { useTrackRowLayout } from "../TrackRows/useTrackRowLayout"
import type { TrackLabels } from "../labels"
import type { TrackRow } from "../../core/layout"
import type { ArrangementScene, ArrangementViewport } from "../../core/scene"

export interface TrackResizeOverlayProps {
  readonly scene: ArrangementScene
  readonly viewport: ArrangementViewport
  readonly labels: TrackLabels
}

function TrackResizeHandle({
  row,
  top,
  height,
  width,
  label,
}: {
  readonly row: TrackRow
  readonly top: number
  readonly height: number
  readonly width: number
  readonly label: string
}) {
  const theme = useTheme()
  const resizeHandlers = useTrackResize(row.track)
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={`${label} ${row.track.name}`}
      aria-orientation="horizontal"
      aria-valuemin={COLLAPSED_TRACK_HEIGHT}
      aria-valuemax={MAX_TRACK_HEIGHT}
      aria-valuenow={row.height}
      testId={`track-resize-${row.track.id}`}
      style={{
        position: "absolute",
        left: 0,
        top,
        width,
        height,
        cursor: "ns-resize",
        focusVisible: {
          outlineWidth: theme.project.trackBorder / 2,
          outlineColor: theme.colors.ring,
          outlineOffset: -theme.project.trackBorder / 2,
        },
      }}
      {...resizeHandlers}
    />
  )
}

export function TrackResizeOverlay({ scene, viewport, labels }: TrackResizeOverlayProps) {
  const theme = useTheme()
  const { bodyTop, bodyBottom, pinnedTop, pinnedViewportTop, visibility } = useTrackRowLayout(
    scene,
    viewport
  )
  const gap = theme.control["--spacing-control-track-gap"]
  const borderInset = theme.project.trackBorder / 2
  const width = viewport.width + theme.project.controlsWidth
  return (
    <>
      {visibility.rows.map(row => {
        const pinned = isPinnedTrack(row.track)
        const boundaryTop = pinned
          ? row.top + borderInset
          : row.top + row.height - borderInset - gap
        const top = Math.max(boundaryTop, pinned ? pinnedViewportTop : bodyTop)
        const bottom = Math.min(boundaryTop + gap, pinned ? bodyBottom : pinnedTop)
        if (bottom <= top) return null
        return (
          <TrackResizeHandle
            key={row.track.id}
            row={row}
            top={top}
            height={bottom - top}
            width={width}
            label={labels.trackHeight}
          />
        )
      })}
    </>
  )
}
