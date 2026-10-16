import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
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
  onCapture,
}: {
  readonly row: TrackRow
  readonly top: number
  readonly height: number
  readonly width: number
  readonly label: string
  readonly onCapture: (trackId: string, captured: boolean) => void
}) {
  const theme = useTheme()
  const currentBounds = useRef({ top, height })
  const capturedBounds = useRef<{ top: number; height: number } | null>(null)
  useLayoutEffect(() => {
    currentBounds.current = { top, height }
  }, [top, height])
  const capture = useCallback(
    (captured: boolean) => {
      capturedBounds.current = captured ? currentBounds.current : null
      onCapture(row.track.id, captured)
    },
    [onCapture, row.track.id]
  )
  const resizeHandlers = useTrackResize(row.track, capture, row.trackGeometry)
  const bounds = capturedBounds.current ?? { top, height }
  if (bounds.height <= 0) return null
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={`${label} ${row.track.name}`}
      aria-orientation="horizontal"
      aria-valuemin={row.trackGeometry.collapsedHeight}
      aria-valuemax={row.trackGeometry.maxHeight}
      aria-valuenow={row.height}
      testId={`track-resize-${row.track.id}`}
      style={{
        position: "absolute",
        left: 0,
        top: bounds.top,
        width,
        height: bounds.height,
        cursor: theme.design.cursors.verticalResize,
        focusVisible: {
          outlineWidth: theme.design.shape.focusRingWidth,
          outlineColor: theme.colors.ring,
          outlineOffset: -theme.design.shape.focusRingWidth,
        },
      }}
      {...resizeHandlers}
    />
  )
}

export function TrackResizeOverlay({ scene, viewport, labels }: TrackResizeOverlayProps) {
  const theme = useTheme()
  const [capturedTrackId, setCapturedTrackId] = useState<string | null>(null)
  const capture = useCallback((trackId: string, captured: boolean) => {
    setCapturedTrackId(current => (captured ? trackId : current === trackId ? null : current))
  }, [])
  const { bodyTop, bodyBottom, pinnedTop, pinnedViewportTop, rows, visibility } = useTrackRowLayout(
    scene,
    viewport
  )
  const gap = theme.control["--spacing-control-track-gap"]
  // Separator bounds meet the row's half-border; this is shared-edge geometry.
  const borderInset = scene.geometry.track.border / 2
  const width = viewport.width + scene.geometry.track.controlsWidth
  return (
    <>
      {rows
        .filter(row => visibility.ids.has(row.track.id) || row.track.id === capturedTrackId)
        .map(row => {
          const pinned = isPinnedTrack(row.track)
          const boundaryTop = pinned
            ? row.top + borderInset
            : row.top + row.height - borderInset - gap
          const top = Math.max(boundaryTop, pinned ? pinnedViewportTop : bodyTop)
          const bottom = Math.min(boundaryTop + gap, pinned ? bodyBottom : pinnedTop)
          return (
            <TrackResizeHandle
              key={row.track.id}
              row={row}
              top={top}
              height={bottom > top ? bottom - top : 0}
              width={width}
              label={labels.trackHeight}
              onCapture={capture}
            />
          )
        })}
    </>
  )
}
