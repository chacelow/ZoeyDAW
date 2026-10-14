import { hitTest } from "../hit-test"
import { layoutTrackRows } from "../layout"
import { snapBar } from "@/project/model/grid-geometry"
import type { TimeSelection } from "@/project/model/types"
import type { ArrangementScene } from "../scene"
import type { Point } from "../interactions/types"

export function timeRangeSelection(
  scene: ArrangementScene,
  startBar: number,
  trackId: string,
  previousTrackIds: readonly string[],
  pointer: Point,
  snap: boolean,
  automationMode: boolean
): TimeSelection {
  const endBar = snapBar(
    1 + (pointer.x + scene.viewport.scrollX) / scene.viewport.pxPerBar,
    snap,
    scene.gridPlan.cellBars,
    scene.bars + 1
  )
  const target = hitTest(scene, pointer.x, pointer.y, automationMode)
  let trackIds = [...previousTrackIds]
  if (target) {
    const rows = layoutTrackRows(scene)
    const first = rows.findIndex(row => row.track.id === trackId)
    const last = rows.findIndex(row => row.track.id === target.track.id)
    if (first !== -1 && last !== -1)
      trackIds = rows
        .slice(Math.min(first, last), Math.max(first, last) + 1)
        .map(row => row.track.id)
  }
  return { startBar: Math.min(startBar, endBar), endBar: Math.max(startBar, endBar), trackIds }
}

export function committedTimeRange(selection: TimeSelection): TimeSelection | null {
  return selection.startBar === selection.endBar ? null : selection
}
