import { secondsAtBar, barAtSeconds } from "@zoeydaw/project-core/tempo-map"
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

function parseFilenameBpm(name: string): number | null {
  const bpmMatch = /(?:^|[_\s\-\(\[])(\d{2,3}(?:\.\d+)?)[_\s\-]*(?:bpm)(?:[_\s\-\]\).]|$)/i.exec(
    name
  )
  if (bpmMatch) {
    const val = parseFloat(bpmMatch[1])
    if (Number.isFinite(val) && val >= 30 && val <= 300) return val
  }
  const prefixMatch = /(?:^|[_\s\-\(\[])(\d{2,3})[_\s\-]+[a-zA-Z]/i.exec(name)
  if (prefixMatch) {
    const val = parseFloat(prefixMatch[1])
    if (Number.isFinite(val) && val >= 60 && val <= 220) return val
  }
  return null
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
  return {
    startBar,
    trackId: row?.track.id,
    left: (startBar - 1) * pxPerBar - scrollX,
    top,
    width: (() => {
      if (source.durationSeconds === null) return null
      const detectedBpm = parseFilenameBpm(source.name) ?? parseFilenameBpm(source.path)
      if (detectedBpm !== null) {
        const { numerator, denominator } = scene.transport
        const warpedBars = (source.durationSeconds * detectedBpm * denominator) / (240 * numerator)
        return Math.max(2, warpedBars * pxPerBar)
      }
      return Math.max(
        2,
        (barAtSeconds(
          scene.transport,
          secondsAtBar(scene.transport, startBar) + source.durationSeconds
        ) -
          startBar) *
          pxPerBar
      )
    })(),
    color: row?.track.color ?? DEFAULT_TRACK_COLOR,
    height: Math.min(bottom - top, rowBottom - top),
  }
}
