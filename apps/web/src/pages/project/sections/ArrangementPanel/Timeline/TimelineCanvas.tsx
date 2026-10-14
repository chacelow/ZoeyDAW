import { useMemo, useRef } from "react"
import { Group, Panel } from "react-resizable-panels"
import { useTranslation } from "@zoeymind/i18n"
import { PanelDivider } from "@/components/panels"
import { useProjectState, projectActions } from "@/pages/project/adapters"
import { deriveGridPlan } from "@/pages/project/model/grid"
import { CONTROLS_WIDTH } from "@/pages/project/layout"
import { ClipDetail } from "../Clip/Detail"
import { CanvasContextMenu } from "../canvas/ContextMenu"
import { MarkerEditor } from "../canvas/interactions/rulers/MarkerEditor"
import { AutomationValueEditor } from "../canvas/interactions/automation/ValueEditor"
import { ClipNameEditor } from "../canvas/interactions/clip/NameEditor"
import { useCanvasGestures } from "../canvas/useCanvasGestures"
import { useSceneSync } from "../canvas/useSceneSync"
import { MiniMap } from "../MiniMap"
import { useArrangementKeyboard } from "./useArrangementKeyboard"
import { useMidiKeyboard } from "./useMidiKeyboard"
import { useCanvasPainters } from "./useCanvasPainters"
import { Toolbar } from "./Toolbar"
import { useTimelineViewport } from "./Viewport/useTimelineViewport"
import { TrackHeaderViewport } from "./TrackHeaderViewport"

/**
Fixed overview/rulers share the scene viewport with virtualized, pinned track headers.
*/
export function TimelineCanvas() {
  const { t } = useTranslation()
  const containerReference = useRef<HTMLDivElement>(null)
  const bodyReference = useRef<HTMLDivElement>(null)
  const canvasBodyReference = useRef<HTMLDivElement>(null)
  const canvasReference = useRef<HTMLCanvasElement>(null)
  const playheadReference = useRef<HTMLCanvasElement>(null)
  const viewport = useTimelineViewport(containerReference, bodyReference, canvasBodyReference)
  const interactions = useCanvasGestures(canvasBodyReference)
  const snapshotError = useProjectState(state => state.session.snapshotError)
  const backendError = useProjectState(state => state.session.backend.error)
  const backendPhase = useProjectState(state => state.session.backend.phase)
  const grid = useProjectState(state => state.workspace.grid)
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  const editingClipId = useProjectState(state => state.session.editingClipId)
  const tracks = useProjectState(state => state.document.tracks)
  const editingClip = useMemo(() => {
    if (!editingClipId) {
      return
    }
    for (const track of tracks) {
      const clip = track.clips.find(item => item.id === editingClipId)
      if (clip) {
        return clip
      }
    }
  }, [editingClipId, tracks])

  useMidiKeyboard()
  useSceneSync()
  useCanvasPainters(canvasBodyReference, canvasReference, playheadReference)
  useArrangementKeyboard()

  return (
    <div
      ref={containerReference}
      data-arrangement-panel
      role="region"
      aria-label={t("arrangement.timeline")}
      className="project-arrangement text-foreground relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--arrangement-surface)]"
    >
      <Toolbar pxPerBar={viewport.pxPerBar} zoom={viewport.zoom} />
      {snapshotError || backendError ? (
        <div
          role="alert"
          className="border-destructive bg-background text-destructive absolute top-14 right-2 z-50 max-w-xs rounded border px-2 py-1 text-xs shadow-lg"
        >
          {snapshotError ?? (backendError ? t(`arrangement.backendError.${backendError}`) : "")}
        </div>
      ) : null}
      {!snapshotError &&
        !backendError &&
        (backendPhase === "opening" || backendPhase === "pending") && (
          <div
            role="status"
            className="bg-background text-muted-foreground absolute top-14 right-2 z-50 px-2 py-1 text-xs"
          >
            {t(
              backendPhase === "opening"
                ? "arrangement.backendOpening"
                : "arrangement.backendPending"
            )}
          </div>
        )}
      <Group orientation="vertical" className="min-h-0 flex-1">
        <Panel defaultSize={32} minSize={32} maxSize={90}>
          <MiniMap
            viewportWidth={viewport.timeViewportWidth}
            bars={viewport.bars}
            pxPerBar={viewport.pxPerBar}
            scrollX={viewport.scrollX}
            minPxPerBar={viewport.minPxPerBar}
            maxPxPerBar={viewport.maxPxPerBar}
            onNavigate={viewport.suspendFollow}
          />
        </Panel>
        <PanelDivider
          orientation="horizontal"
          aria-label={t("arrangement.resizeMinimap")}
          className="hover:before:bg-ring focus-visible:before:bg-ring bg-[var(--arrangement-ruler)] before:pointer-events-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-[var(--arrangement-line)]"
        />
        <Panel minSize={160}>
          <div className="flex h-full min-h-0 flex-col">
            <div ref={bodyReference} className="relative min-h-0 flex-1">
              <div
                ref={canvasBodyReference}
                data-arrangement-canvas-host
                role="application"
                aria-label={t("arrangement.timelineEditor")}
                tabIndex={0}
                className="absolute inset-y-0 left-0"
                style={{ right: CONTROLS_WIDTH, touchAction: "none" }}
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
                <MarkerEditor />
                <AutomationValueEditor />
                <ClipNameEditor />
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
              />
            </div>
            {editingClip ? (
              <div className="relative h-[190px] shrink-0">
                <ClipDetail clip={editingClip} close={() => projectActions.setEditingClip(null)} />
              </div>
            ) : null}
          </div>
        </Panel>
      </Group>
    </div>
  )
}
