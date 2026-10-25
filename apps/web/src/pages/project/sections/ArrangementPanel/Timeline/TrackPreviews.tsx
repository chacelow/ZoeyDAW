import { useMemo } from "react"
import { DEFAULT_TRACK_HEIGHT, arrangementViewProjection } from "@/pages/project/layout"
import { visibleTracks } from "@zoeydaw/project-core/types"
import { createTrack } from "@zoeydaw/project-core/reducers"
import { useProjectState } from "@/pages/project/adapters"
import { TrackHeaderRow } from "../TrackHeader/Row"
import { BAR_RULER_HEIGHT, layoutTrackRowsForViewport, pinnedTopFor } from "../canvas/layout"
import type { useTimelineViewport } from "./Viewport/useTimelineViewport"
import type { useBrowserAudioDrop } from "./useBrowserAudioDrop"

export function TrackPreviews({
  viewport,
  browserDrop,
}: {
  readonly viewport: Pick<
    ReturnType<typeof useTimelineViewport>,
    "scrollY" | "bodyHeight" | "controlsWidth" | "visible"
  >
  readonly browserDrop: Pick<ReturnType<typeof useBrowserAudioDrop>, "target" | "source">
}) {
  const arrangementView = useProjectState(state => state.workspace.arrangementView)
  const automationMode = useProjectState(state => state.workspace.automationMode)
  const automationLanes = useProjectState(state => state.workspace.automationLanes)
  const tracks = useProjectState(state => state.document.tracks)
  const projectPreview = useProjectState(state => state.session.preview)
  const clipTrackPreviews = useMemo(() => {
    if (projectPreview?.kind !== "tracks") return []
    const projected = visibleTracks(
      arrangementViewProjection(projectPreview.tracks, arrangementView).tracks
    )
    return layoutTrackRowsForViewport(projected, viewport.scrollY, viewport.bodyHeight, {
      mode: automationMode,
      lanes: automationLanes,
    }).filter(row => !tracks.some(track => track.id === row.track.id))
  }, [
    projectPreview,
    arrangementView,
    viewport.scrollY,
    viewport.bodyHeight,
    automationMode,
    automationLanes,
    tracks,
  ])
  const creatingTrack = browserDrop.target !== null && browserDrop.target.trackId === undefined
  const newTrackPreview = useMemo(() => {
    const source = browserDrop.source
    if (!creatingTrack || !source) return null
    return {
      ...createTrack("audio", tracks, undefined, DEFAULT_TRACK_HEIGHT),
      id: `audio-drop-preview-${source.token}`,
      name: source.name,
    }
  }, [creatingTrack, browserDrop.source, tracks])
  return (
    <>
      {clipTrackPreviews.map(row => (
        <div
          key={row.track.id}
          data-clip-new-track-preview
          inert
          aria-hidden="true"
          className="pointer-events-none absolute right-0 z-10 overflow-hidden opacity-50"
          style={{
            top: Math.max(BAR_RULER_HEIGHT, row.top),
            width: viewport.controlsWidth,
            height: Math.max(
              0,
              Math.min(
                row.top + row.height,
                pinnedTopFor(viewport.visible, viewport.bodyHeight, {
                  mode: automationMode,
                  lanes: automationLanes,
                })
              ) - Math.max(BAR_RULER_HEIGHT, row.top)
            ),
          }}
        >
          <div
            style={{
              transform: `translateY(${Math.min(0, row.top - BAR_RULER_HEIGHT)}px)`,
            }}
          >
            <TrackHeaderRow track={row.track} rails={[]} routing={arrangementView.routing} />
          </div>
        </div>
      ))}
      {newTrackPreview && browserDrop.target && (
        <div
          data-browser-new-track-preview
          inert
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-10 overflow-hidden"
          style={{
            top: browserDrop.target.top,
            height: browserDrop.target.height,
          }}
        >
          <div
            className="absolute inset-y-0 right-0 overflow-hidden bg-[var(--arrangement-ruler)] opacity-50"
            style={{ width: viewport.controlsWidth }}
          >
            <TrackHeaderRow track={newTrackPreview} rails={[]} routing={arrangementView.routing} />
          </div>
          <div className="absolute inset-x-0 top-0 z-30 h-[2px] bg-[var(--arrangement-line)]" />
          <div className="absolute inset-x-0 bottom-0 z-30 h-[2px] bg-[var(--arrangement-line)]" />
        </div>
      )}
    </>
  )
}
