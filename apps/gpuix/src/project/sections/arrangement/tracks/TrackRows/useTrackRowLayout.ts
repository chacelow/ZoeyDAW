import { useMemo } from "react"
import { visibleTracks } from "@/project/model/types"
import {
  arrangementBodyTop,
  arrangementBodyBottom,
  isPinnedTrack,
  layoutTrackRowsForViewport,
  pinnedTrackHeight,
} from "../../core/layout"
import type { ArrangementScene, ArrangementViewport } from "../../core/scene"

export function useTrackRowLayout(scene: ArrangementScene, viewport: ArrangementViewport) {
  const tracks = useMemo(() => visibleTracks([...scene.tracks]), [scene.tracks])
  const rows = useMemo(
    () =>
      layoutTrackRowsForViewport(tracks, viewport.scrollY, viewport.height, scene.geometry.track),
    [tracks, viewport.scrollY, viewport.height, scene.geometry.track]
  )
  const bodyTop = arrangementBodyTop()
  const bodyBottom = arrangementBodyBottom(viewport.height)
  const pinnedTop = bodyBottom - pinnedTrackHeight(tracks, scene.geometry.track)
  const pinnedViewportTop = Math.max(bodyTop, pinnedTop)
  const visibility = useMemo(() => {
    const visibleRows = rows.filter(
      row =>
        row.top + row.height > (isPinnedTrack(row.track) ? pinnedViewportTop : bodyTop) &&
        row.top < (isPinnedTrack(row.track) ? bodyBottom : pinnedTop)
    )
    return { rows: visibleRows, ids: new Set(visibleRows.map(row => row.track.id)) }
  }, [rows, bodyTop, bodyBottom, pinnedTop, pinnedViewportTop])
  return { rows, bodyTop, bodyBottom, pinnedTop, pinnedViewportTop, visibility }
}
