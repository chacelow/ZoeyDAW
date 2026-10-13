import { useMemo, useState } from "react"
import type { Track } from "@/pages/project/model/types"
import { projectTrackGroups } from "@/pages/project/model/track-groups"
import { TrackHeaderRow } from "@/pages/project/sections/ArrangementPanel/TrackHeader/Row"
import {
  arrangementBodyTop,
  arrangementBodyBottom,
  isPinnedTrack,
  layoutTrackRowsForViewport,
  pinnedTrackHeight,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { CONTROLS_WIDTH } from "../Viewport/useTimelineViewport"

/** Keeps keyboard-focused offscreen headers mounted while virtualizing rows and pinning returns/main. */
export function TrackHeaderViewport({
  tracks,
  scrollY,
  height,
}: {
  tracks: readonly Track[]
  scrollY: number
  height: number
}) {
  const [focusedHeader, setFocusedHeader] = useState<string | null>(null)
  const rows = useMemo(
    () => layoutTrackRowsForViewport(tracks, scrollY, height),
    [tracks, scrollY, height]
  )
  const groupProjection = useMemo(() => projectTrackGroups(tracks), [tracks])
  const scrollableBottom = arrangementBodyBottom(height) - pinnedTrackHeight(tracks)
  return (
    <div
      className="absolute inset-y-0 right-0 overflow-hidden border-l border-[var(--arrangement-line)] bg-[var(--arrangement-ruler)]"
      style={{ width: CONTROLS_WIDTH }}
      onFocusCapture={event => {
        if (event.target instanceof Element)
          setFocusedHeader(
            event.target.closest("[data-track-header]")?.getAttribute("data-track-header") ?? null
          )
      }}
      onBlurCapture={event => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return
        setFocusedHeader(null)
      }}
    >
      <div
        className="absolute inset-x-0 overflow-hidden"
        style={{ top: arrangementBodyTop(), bottom: height - scrollableBottom }}
      >
        {rows
          .filter(
            row =>
              !isPinnedTrack(row.track) &&
              (row.track.id === focusedHeader ||
                (row.top + row.height > arrangementBodyTop() && row.top < scrollableBottom))
          )
          .map(row => (
            <div
              key={row.track.id}
              className="absolute inset-x-0"
              style={{ top: row.top - arrangementBodyTop(), height: row.height }}
            >
              <TrackHeaderRow
                track={row.track}
                rails={groupProjection.railsByTrackId.get(row.track.id) ?? []}
              />
            </div>
          ))}
      </div>
      <div
        className="absolute inset-x-0 overflow-hidden"
        style={{ top: scrollableBottom, bottom: height - arrangementBodyBottom(height) }}
      >
        {rows
          .filter(row => isPinnedTrack(row.track))
          .map(row => (
            <div
              key={row.track.id}
              className="absolute inset-x-0"
              style={{ top: row.top - scrollableBottom, height: row.height }}
            >
              <TrackHeaderRow
                track={row.track}
                rails={groupProjection.railsByTrackId.get(row.track.id) ?? []}
              />
            </div>
          ))}
      </div>
    </div>
  )
}
