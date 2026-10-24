import { visibleTracks } from "@zoeydaw/project-core/types"
import { canAcceptAudioDrop } from "@zoeydaw/project-core/audio-drop"
import { DEFAULT_TRACK_COLOR } from "@zoeydaw/project-core/reducers"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { arrangementBodyTop, dropZoneTop, layoutTrackRows, pinnedTopFor } from "../canvas/layout"
import { snapBar } from "../Grid/geometry"
import type { ArrangementScene } from "../canvas/scene"
import type { BrowserAudioDragSource } from "@/pages/project/adapters/browser"

export interface BrowserAudioPlacement {
  startBar: number
  trackId: string | undefined
  left: number
  top: number
  height: number
  width: number | null
  color: string
}

export function browserAudioPlacement(
  scene: ArrangementScene,
  point: { x: number; y: number },
  snap: boolean,
  source: BrowserAudioDragSource
): BrowserAudioPlacement | null {
  const { x, y } = point
  const { width, height, scrollX, scrollY, pxPerBar } = scene.viewport
  const tracks = visibleTracks(scene.tracks)
  const display = { mode: scene.automationMode, lanes: scene.automationLanes }
  const bodyTop = arrangementBodyTop()
  const bottom = pinnedTopFor(tracks, height, display)
  if (x < 0 || x >= width || y < bodyTop || y >= bottom) return null
  const row = layoutTrackRows(scene).find(row => y >= row.top && y < row.top + row.height)
  if (row && (!canAcceptAudioDrop(row.track) || y >= row.top + row.contentHeight)) return null
  const emptyTop = Math.max(bodyTop, dropZoneTop(tracks, scrollY, display))
  if (!row && y < emptyTop) return null
  const startBar = snapBar(
    1 + (x + scrollX) / pxPerBar,
    snap,
    scene.gridPlan.cellBars,
    scene.bars + 1
  )
  const top = Math.max(bodyTop, row?.top ?? emptyTop)
  const rowBottom = row ? row.top + row.contentHeight : emptyTop + DEFAULT_TRACK_HEIGHT
  const { bpm, numerator, denominator } = scene.transport
  const secondsPerBar = (60 * numerator * 4) / (bpm * denominator)
  return {
    startBar,
    trackId: row?.track.id,
    left: (startBar - 1) * pxPerBar - scrollX,
    top,
    width:
      source.durationSeconds === null
        ? null
        : Math.max(2, (source.durationSeconds / secondsPerBar) * pxPerBar),
    color: row?.track.color ?? DEFAULT_TRACK_COLOR,
    height: Math.min(bottom - top, rowBottom - top),
  }
}
