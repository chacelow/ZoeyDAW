import { useProjectState } from "@/project/adapters"
import { sx } from "@/shared/theme/style"
import type { ArrangementScene, ArrangementViewport } from "../../core/scene"
import type { TrackRow } from "../../core/layout"
import type { PeakReader } from "@/project/model/backend"
import { LaneContents } from "./Contents"
import type { CreationNames } from "@/project/defaults/template"

export interface LaneRowProps {
  row: TrackRow
  scene: ArrangementScene
  viewport: ArrangementViewport
  readPeaks: PeakReader
  creationNames: Pick<CreationNames, "clip">
}

export function LaneRow({ row, scene, viewport, readPeaks, creationNames }: LaneRowProps) {
  const automationMode = useProjectState(state => state.workspace.automationMode)
  return (
    <div
      testId={`lane-row-${row.track.id}`}
      role="group"
      aria-label={row.track.name}
      style={sx({
        position: "relative",
        width: viewport.width,
        height: row.height,
        userSelect: "none",
        pointerEvents: "none",
      })}
    >
      <LaneContents
        row={row}
        scene={scene}
        automationMode={automationMode}
        readPeaks={readPeaks}
        creationNames={creationNames}
      />
    </div>
  )
}
