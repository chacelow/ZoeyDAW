import { projectTrackGroups } from "@zoeydaw/project-core/track-groups"
import { resolveColor } from "../tokens"
import type { TokenSet } from "../tokens"
import type { TrackGroupProjection } from "@zoeydaw/project-core/track-groups"
import type { Track } from "@zoeydaw/project-core/types"
import type { TrackRow } from "../layout"
import type { ArrangementScene } from "../scene"

const descendantsByTracks = new WeakMap<readonly Track[], TrackGroupProjection>()

type GroupContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "fillStyle" | "globalAlpha" | "fillRect"
>

/**
Collapsed groups summarize leaf content in ordered, color-coded bands.
*/
export function paintGroupOverview(
  context: GroupContext,
  row: TrackRow,
  scene: ArrangementScene,
  tokens: TokenSet
): void {
  if (!row.track.collapsed) {
    return
  }
  let projection = descendantsByTracks.get(scene.tracks)
  if (!projection) {
    projection = projectTrackGroups(scene.tracks)
    descendantsByTracks.set(scene.tracks, projection)
  }
  const descendants = projection.leafDescendantsByGroupId.get(row.track.id)
  if (!descendants?.length) {
    return
  }

  const { pxPerBar, scrollX, width } = scene.viewport
  const top = row.top + 3
  const available = Math.max(0, row.height - 6)
  const pitch = available / descendants.length
  const bandHeight = Math.max(0.5, Math.min(2, pitch - 1))
  context.save()
  context.globalAlpha = 0.85
  for (const [index, track] of descendants.entries()) {
    const y = top + index * pitch + Math.max(0, (pitch - bandHeight) / 2)
    for (const clip of track.clips) {
      const left = (clip.startBar - 1) * pxPerBar - scrollX
      const right = left + clip.lengthBars * pxPerBar
      if (right <= 0 || left >= width) {
        continue
      }
      context.fillStyle = clip.mute
        ? tokens["--arrangement-muted-clip-title"]
        : resolveColor(clip.color ?? track.color, tokens, tokens["--primary"])
      context.fillRect(Math.max(0, left), y, Math.min(width, right) - Math.max(0, left), bandHeight)
    }
  }
  context.restore()
}
