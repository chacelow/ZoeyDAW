import { projectTrackGroups, type TrackGroupProjection } from "@/pages/project/model/track-groups"
import type { Track } from "@/pages/project/model/types"
import type { TrackRow } from "../layout"
import type { ArrangementScene } from "../scene"
import { resolveColor, type TokenSet } from "../tokens"

const descendantsByTracks = new WeakMap<readonly Track[], TrackGroupProjection>()

type GroupContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "fillStyle" | "globalAlpha" | "fillRect"
>

/** Collapsed groups summarize leaf content in ordered, color-coded bands. */
export function paintGroupOverview(
  ctx: GroupContext,
  row: TrackRow,
  scene: ArrangementScene,
  tokens: TokenSet
): void {
  if (!row.track.collapsed) return
  let projection = descendantsByTracks.get(scene.tracks)
  if (!projection) {
    projection = projectTrackGroups(scene.tracks)
    descendantsByTracks.set(scene.tracks, projection)
  }
  const descendants = projection.leafDescendantsByGroupId.get(row.track.id)
  if (!descendants?.length) return

  const { pxPerBar, scrollX, width } = scene.viewport
  const top = row.top + 3
  const available = Math.max(0, row.height - 6)
  const pitch = available / descendants.length
  const bandHeight = Math.max(0.5, Math.min(2, pitch - 1))
  ctx.save()
  ctx.globalAlpha = 0.85
  for (let index = 0; index < descendants.length; index++) {
    const track = descendants[index]
    const y = top + index * pitch + Math.max(0, (pitch - bandHeight) / 2)
    for (const clip of track.clips) {
      const left = (clip.startBar - 1) * pxPerBar - scrollX
      const right = left + clip.lengthBars * pxPerBar
      if (right <= 0 || left >= width) continue
      ctx.fillStyle = resolveColor(clip.color ?? track.color, tokens, tokens["--primary"])
      ctx.fillRect(Math.max(0, left), y, Math.min(width, right) - Math.max(0, left), bandHeight)
    }
  }
  ctx.restore()
}
