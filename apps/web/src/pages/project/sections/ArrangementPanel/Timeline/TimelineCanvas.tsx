// @refresh reset
import { useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { deriveGridPlan } from "@zoeydaw/project-core/grid"
import { CanvasContextMenu } from "../canvas/ContextMenu"
import { MarkerEditor } from "../canvas/interactions/rulers/MarkerEditor"
import { AutomationValueEditor } from "../canvas/interactions/automation/ValueEditor"
import { ClipNameEditor } from "../canvas/interactions/clip/NameEditor"
import { useCanvasGestures } from "../canvas/useCanvasGestures"
import { useSceneSync } from "../canvas/useSceneSync"
import { useArrangementKeyboard } from "./useArrangementKeyboard"
import { useMidiKeyboard } from "./useMidiKeyboard"
import { useCanvasPainters } from "./useCanvasPainters"
import { BAR_RULER_HEIGHT, dropZoneTop, pinnedTopFor } from "../canvas/layout"
import { Toolbar } from "./Toolbar"
import { useTimelineViewport } from "./Viewport/useTimelineViewport"
import { TrackHeaderViewport } from "./TrackHeaderViewport"
import { TrackDropZone } from "./TrackDropZone"
import { useBrowserAudioDrop } from "./useBrowserAudioDrop"

import { BackendStatus } from "./BackendStatus"
import { TimelinePanels } from "./TimelinePanels"
import { BrowserDropOverlay } from "./BrowserDropOverlay"
import { TrackPreviews } from "./TrackPreviews"

/**
Fixed overview/rulers share the scene viewport with virtualized, pinned track headers.
*/
export function TimelineCanvas({ snapshots = true }: { readonly snapshots?: boolean }) {
  const { t } = useTranslation()
  const containerReference = useRef<HTMLDivElement>(null)
  const bodyReference = useRef<HTMLDivElement>(null)
  const canvasBodyReference = useRef<HTMLDivElement>(null)
  const canvasReference = useRef<HTMLCanvasElement>(null)
  const playheadReference = useRef<HTMLCanvasElement>(null)
  const viewport = useTimelineViewport(containerReference, bodyReference, canvasBodyReference)
  const interactions = useCanvasGestures(canvasBodyReference)
  const grid = useProjectState(state => state.workspace.grid)
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  const arrangementView = useProjectState(state => state.workspace.arrangementView)
  const automationMode = useProjectState(state => state.workspace.automationMode)
  const automationLanes = useProjectState(state => state.workspace.automationLanes)
  const browserDrop = useBrowserAudioDrop()

  useMidiKeyboard()
  useSceneSync(viewport.bars)
  useCanvasPainters(canvasBodyReference, canvasReference, playheadReference)
  useArrangementKeyboard({ snapshots })

  return (
    <div
      ref={containerReference}
      data-arrangement-panel
      role="region"
      aria-label={t("arrangement.timeline")}
      className="project-arrangement text-foreground relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--arrangement-surface)]"
    >
      <Toolbar pxPerBar={viewport.pxPerBar} zoom={viewport.zoom} snapshots={snapshots} />
      <BackendStatus />
      <TimelinePanels viewport={viewport}>
        <div className="flex h-full min-h-0 flex-col">
          <div ref={bodyReference} className="relative min-h-0 flex-1">
            <div
              ref={canvasBodyReference}
              data-arrangement-canvas-host
              role="application"
              aria-label={t("arrangement.timelineEditor")}
              tabIndex={0}
              className="absolute inset-y-0 left-0"
              style={{ right: viewport.controlsWidth, touchAction: "none" }}
              onDragOver={browserDrop.onDragOver}
              onDragLeave={browserDrop.onDragLeave}
              onDrop={browserDrop.onDrop}
            >
              <CanvasContextMenu getTarget={interactions.contextTarget}>
                <canvas
                  ref={canvasReference}
                  className="absolute inset-0"
                  aria-label={t("arrangement.timelineCanvas")}
                  data-arrangement-canvas
                />
                <canvas
                  ref={playheadReference}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  data-arrangement-playhead
                />
              </CanvasContextMenu>
              <BrowserDropOverlay browserDrop={browserDrop} />
              <MarkerEditor />
              <AutomationValueEditor />
              <ClipNameEditor />
              <TrackDropZone
                top={dropZoneTop(viewport.visible, viewport.scrollY, {
                  mode: automationMode,
                  lanes: automationLanes,
                })}
                clipTop={BAR_RULER_HEIGHT}
                clipBottom={pinnedTopFor(viewport.visible, viewport.bodyHeight, {
                  mode: automationMode,
                  lanes: automationLanes,
                })}
              />
              <span
                data-arrangement-grid-resolution
                className="text-muted-foreground pointer-events-none absolute right-2 bottom-[18px] z-10 rounded-sm bg-[var(--arrangement-ruler)] px-1 text-[10px] leading-[16px] tabular-nums"
              >
                {deriveGridPlan(grid, viewport.pxPerBar, numerator, denominator).label}
              </span>
            </div>
            <TrackHeaderViewport
              tracks={viewport.visible}
              scrollY={viewport.scrollY}
              height={viewport.bodyHeight}
              controlsWidth={viewport.controlsWidth}
              routing={arrangementView.routing}
            />
            <TrackPreviews viewport={viewport} browserDrop={browserDrop} />
          </div>
        </div>
      </TimelinePanels>
    </div>
  )
}
