import { useProjectState } from "@/pages/project/adapters"
import { useEffect, useMemo, useState } from "react"
import { projectTrackGroups } from "@zoeydaw/project-core/track-groups"
import { InsertTrackMenu } from "../InsertTrackMenu"
import { TrackHeaderRow } from "@/pages/project/sections/ArrangementPanel/TrackHeader/Row"
import {
  displayedAutomationTargets,
  EXTRA_AUTOMATION_HEIGHT,
  arrangementBodyBottom,
  arrangementBodyTop,
  dropZoneTop,
  isPinnedTrack,
  layoutTrackRowsForViewport,
  pinnedTopFor,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { AutomationLaneHeader } from "@/pages/project/sections/ArrangementPanel/TrackHeader/TrackIdentity/AutomationSelector"
import type { Track } from "@zoeydaw/project-core/types"

/**
Keeps keyboard-focused offscreen headers mounted while virtualizing rows and pinning returns/main.
*/
export function TrackHeaderViewport({
  tracks,
  scrollY,
  height,
  controlsWidth,
  routing,
}: {
  readonly tracks: readonly Track[]
  readonly scrollY: number
  readonly height: number
  readonly controlsWidth: number
  readonly routing: boolean
}) {
  const [focusedHeader, setFocusedHeader] = useState<string | null>(null)
  const automationMode = useProjectState(s => s.workspace.automationMode)
  const automationLanes = useProjectState(s => s.workspace.automationLanes)
  const display = useMemo(
    () => ({ mode: automationMode, lanes: automationLanes }),
    [automationMode, automationLanes]
  )
  const rows = useMemo(
    () => layoutTrackRowsForViewport(tracks, scrollY, height, display),
    [tracks, scrollY, height, display]
  )
  const groupProjection = useMemo(() => projectTrackGroups(tracks), [tracks])
  const scrollableBottom = pinnedTopFor(tracks, height, display)
  useEffect(() => {
    if (focusedHeader && !tracks.some(track => track.id === focusedHeader)) {
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement.closest("[data-track-header]")?.getAttribute("data-track-header") ===
          focusedHeader
      ) {
        document.activeElement.blur()
      }
      setFocusedHeader(null)
    }
  }, [focusedHeader, tracks])
  return (
    <div
      className="absolute inset-y-0 right-0 overflow-hidden bg-[var(--arrangement-ruler)]"
      style={{ width: controlsWidth }}
      onFocusCapture={event => {
        if (event.target instanceof Element) {
          setFocusedHeader(
            event.target.closest("[data-track-header]")?.getAttribute("data-track-header") ?? null
          )
        }
      }}
      onBlurCapture={event => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return
        }
        setFocusedHeader(null)
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-30 w-[2px] bg-[var(--arrangement-line)]"
      />
      {/* The card frame is shared with the canvas: one line above the stack and
          one above the pinned strip, drawn over the rows rather than as borders.
          The canvas centers its 2px top stroke on `bodyTop + 0.5`, so the
          header line starts one pixel earlier to cover the same rows. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-30 h-[2px] bg-[var(--arrangement-line)]"
        style={{ top: arrangementBodyTop() - 1 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-30 h-[2px] bg-[var(--arrangement-line)]"
        style={{ top: scrollableBottom - 2 }}
      />
      <div
        className="absolute inset-x-0 overflow-hidden"
        style={{ top: arrangementBodyTop(), bottom: height - scrollableBottom }}
      >
        <InsertTrackMenu>
          <div
            data-track-header-drop-zone
            className="absolute inset-x-0 bottom-0"
            style={{
              top: Math.max(0, dropZoneTop(tracks, scrollY, display) - arrangementBodyTop()),
            }}
          />
        </InsertTrackMenu>
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
                routing={routing}
              />
              {displayedAutomationTargets(row.track, display).map((target, index) => (
                <AutomationLaneHeader
                  key={`${target.kind}:${target.kind === "device" ? target.deviceId : ""}:${target.parameter}`}
                  track={row.track}
                  target={target}
                  top={row.contentHeight + index * EXTRA_AUTOMATION_HEIGHT}
                />
              ))}
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
                routing={routing}
              />
              {displayedAutomationTargets(row.track, display).map((target, index) => (
                <AutomationLaneHeader
                  key={`${target.kind}:${target.kind === "device" ? target.deviceId : ""}:${target.parameter}`}
                  track={row.track}
                  target={target}
                  top={row.contentHeight + index * EXTRA_AUTOMATION_HEIGHT}
                />
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}
