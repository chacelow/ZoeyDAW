import { useMemo, useRef, type CSSProperties } from "react"
import { Group, Panel } from "react-resizable-panels"
import { useTranslation } from "@zoeymind/i18n"
import { PanelDivider } from "@/components/panels"
import { useProjectState, projectActions } from "@/pages/project/adapters"
import { deriveGridPlan } from "@/pages/project/model/grid"
import { TRACK_LAYOUT } from "@/pages/project/model/selectors"
import { ClipDetail } from "../Clip/Detail"
import { CanvasContextMenu } from "../canvas/ContextMenu"
import { MarkerEditor } from "../canvas/interactions/rulers/MarkerEditor"
import { AutomationValueEditor } from "../canvas/interactions/automation/ValueEditor"
import { ClipNameEditor } from "../canvas/interactions/clip/NameEditor"
import { useCanvasGestures } from "../canvas/useCanvasGestures"
import { useSceneSync } from "../canvas/useSceneSync"
import { useArrangementKeyboard } from "./useArrangementKeyboard"
import { useMidiKeyboard } from "./useMidiKeyboard"
import { useCanvasPainters } from "./useCanvasPainters"
import { Toolbar } from "./Toolbar"
import { MiniMap } from "../MiniMap"
import { CONTROLS_WIDTH, useTimelineViewport } from "./Viewport/useTimelineViewport"
import { TrackHeaderViewport } from "./TrackHeaderViewport"

const trackLayoutStyle: CSSProperties & Record<`--${string}`, string> = {
  "--spacing-control-track": `${TRACK_LAYOUT.controlHeight}px`,
  "--spacing-control-track-gap": `${TRACK_LAYOUT.spacing}px`,
}

/** Fixed overview/rulers share the scene viewport with virtualized, pinned track headers. */
export function TimelineCanvas() {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const canvasBodyRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playheadRef = useRef<HTMLCanvasElement>(null)
  const viewport = useTimelineViewport(containerRef, bodyRef, canvasBodyRef)
  const interactions = useCanvasGestures(canvasBodyRef)
  const snapshotError = useProjectState(state => state.session.snapshotError)
  const grid = useProjectState(state => state.workspace.grid)
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  const editingClipId = useProjectState(state => state.session.editingClipId)
  const tracks = useProjectState(state => state.document.tracks)
  const editingClip = useMemo(() => {
    if (!editingClipId) return undefined
    for (const track of tracks) {
      const clip = track.clips.find(item => item.id === editingClipId)
      if (clip) return clip
    }
    return undefined
  }, [editingClipId, tracks])

  useMidiKeyboard()
  useSceneSync()
  useCanvasPainters(canvasBodyRef, canvasRef, playheadRef)
  useArrangementKeyboard()

  return (
    <div
      ref={containerRef}
      data-arrangement-panel
      className="project-arrangement relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--arrangement-surface)] text-foreground"
      style={trackLayoutStyle}
    >
      <Toolbar pxPerBar={viewport.pxPerBar} zoom={viewport.zoom} />
      {snapshotError && (
        <div
          role="alert"
          className="absolute right-2 top-14 z-50 max-w-xs rounded border border-destructive bg-background px-2 py-1 text-xs text-destructive shadow-lg"
        >
          {snapshotError}
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
          className="bg-[var(--arrangement-ruler)] before:pointer-events-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-[var(--arrangement-line)] hover:before:bg-ring focus-visible:before:bg-ring"
        />
        <Panel minSize={160}>
          <div className="flex h-full min-h-0 flex-col">
            <div ref={bodyRef} className="relative min-h-0 flex-1">
              <div
                ref={canvasBodyRef}
                data-arrangement-canvas-host
                tabIndex={0}
                className="absolute inset-y-0 left-0"
                style={{ right: CONTROLS_WIDTH, touchAction: "none" }}
              >
                <CanvasContextMenu getTarget={interactions.contextTarget}>
                  <canvas ref={canvasRef} className="absolute inset-0" data-arrangement-canvas />
                  <canvas
                    ref={playheadRef}
                    className="pointer-events-none absolute inset-0"
                    data-arrangement-playhead
                  />
                </CanvasContextMenu>
                <MarkerEditor />
                <AutomationValueEditor />
                <ClipNameEditor />
                <span
                  data-arrangement-grid-resolution
                  className="pointer-events-none absolute right-2 bottom-[18px] z-10 rounded-sm bg-[var(--arrangement-ruler)] px-1 text-[10px] leading-[16px] tabular-nums text-muted-foreground"
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
            {editingClip && (
              <div className="relative h-[190px] shrink-0">
                <ClipDetail clip={editingClip} close={() => projectActions.setEditingClip(null)} />
              </div>
            )}
          </div>
        </Panel>
      </Group>
    </div>
  )
}
