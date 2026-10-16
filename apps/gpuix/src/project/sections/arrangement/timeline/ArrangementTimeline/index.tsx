import { useCallback, useEffect, useSyncExternalStore } from "react"
import { consumeKey, useWindowKeyboard } from "@/platform/keyboard"
import { projectActions, useProjectState } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { ControlledScrollbar } from "@/ui/controls"
import { Group, Panel, PanelDivider } from "@/ui/panels"
import { Grid } from "../grid"
import { MiniMap } from "../minimap"
import { Rulers, TimeRuler } from "../rulers"
import { Toolbar } from "../toolbar"
import type { EventPayload, Props, PublicInstance } from "@gpuix/react"
import type { ReactNode } from "react"
import type { CursorLockPort } from "@/ui/controls"
import type { PanelDimensions } from "@/ui/panels"
import type { TimelineController } from "../controller"
import type { TimelineLabels } from "../labels"

export type TimelineEditSurface = Pick<
  Props,
  "onMouseDown" | "onMouseMove" | "onMouseUp" | "onMouseLeave" | "onKeyDown" | "onBlur" | "style"
> & {
  ref: (instance: PublicInstance | null) => void
  wrap: (surface: ReactNode) => ReactNode
}

export interface ArrangementTimelineProps {
  controller: TimelineController
  tracks: ReactNode
  overlay: ReactNode
  labels: TimelineLabels
  cursor: CursorLockPort
  editSurface?: TimelineEditSurface
  interactionOverlay?: ReactNode
}

export function ArrangementTimeline({
  controller,
  tracks,
  overlay,
  labels,
  cursor,
  editSurface,
  interactionOverlay,
}: ArrangementTimelineProps) {
  const theme = useTheme()
  const keyboard = useWindowKeyboard()
  const view = controller.view
  const current = useSyncExternalStore(controller.sceneStore.subscribe, controller.sceneStore.get)
  const presentation = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const viewport = current.viewport
  const scrollbarHeight = theme.control["--spacing-control-icon-slot"]
  const width = presentation.size.containerWidth
  const geometry = view.overviewGeometry()
  const { barRulerHeight, timeRulerHeight } = theme.layout.arrangement
  const trackBodyHeight = Math.max(0, viewport.height - barRulerHeight - timeRulerHeight)
  const { wrap, ...surfaceHandlers } = editSurface ?? { wrap: undefined }
  const inputSurface = (
    <div
      {...surfaceHandlers}
      role="application"
      aria-label={labels.timeline}
      tabIndex={0}
      testId="timeline-viewport"
      style={sx(
        {
          position: "absolute",
          left: 0,
          top: barRulerHeight,
          width: viewport.width,
          height: trackBodyHeight,
          keyboardFocusDim: false,
          focusVisible: {
            outlineWidth: theme.design.shape.focusRingWidth,
            outlineColor: theme.colors.ring,
            outlineOffset: -theme.design.shape.focusRingWidth,
          },
        },
        editSurface?.style
      )}
    />
  )

  useEffect(() => {
    const down = keyboard.subscribe("keyDown", event => {
      consumeKey(event, controller.keyboard.down(event) ? "handled" : "pass")
    })
    const up = keyboard.subscribe("keyUp", event => {
      consumeKey(event, controller.keyboard.up(event) ? "handled" : "pass")
    })
    return () => {
      down()
      up()
      view.cancelGestures()
    }
  }, [controller, keyboard, view])

  const resizeOverview = useCallback(
    (dimensions: PanelDimensions) => {
      view.setOverviewHeight(dimensions.inPixels - scrollbarHeight)
    },
    [view, scrollbarHeight]
  )

  const onLayout = useCallback(
    (event: EventPayload) => {
      if (event.width === undefined || event.height === undefined) return
      view.measure({
        containerWidth: event.width,
        bodyHeight: event.height,
        timelineLeft: event.x ?? view.getSnapshot().size.timelineLeft,
      })
    },
    [view]
  )

  return (
    <div
      role="region"
      aria-label={labels.timeline}
      testId="arrangement-timeline"
      style={sx({
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        backgroundColor: theme.colors.arrangementSurfaceAlt,
      })}
    >
      <Toolbar
        pxPerBar={viewport.pxPerBar}
        zoom={view.stepZoom}
        keyboard={controller.keyboard}
        labels={labels}
      />
      <Group
        orientation="vertical"
        style={sx({
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          backgroundColor: theme.colors.arrangementSurfaceAlt,
        })}
      >
        <Panel
          defaultSize={theme.project.minimapMinHeight + scrollbarHeight}
          minSize={theme.project.minimapMinHeight + scrollbarHeight}
          maxSize={theme.project.minimapMaxHeight + scrollbarHeight}
          onResize={resizeOverview}
        >
          <MiniMap
            geometry={geometry}
            width={width}
            height={presentation.overviewHeight}
            label={labels.minimap}
            cursor={cursor}
            onNavigate={view.suspendFollow}
            onViewport={projectActions.setViewport}
            onFit={controller.fitToProject}
            registerGesture={view.registerMinimap}
          />
          <ControlledScrollbar
            testId="timeline-horizontal-scroll"
            aria-label={labels.horizontalScroll}
            aria-controls="timeline-viewport"
            orientation="horizontal"
            value={viewport.scrollX}
            viewport={viewport.width}
            extent={current.bars * viewport.pxPerBar}
            length={width}
            onChange={value =>
              controller.setScroll(value, controller.sceneStore.get().viewport.scrollY)
            }
          />
        </Panel>
        <PanelDivider orientation="horizontal" aria-label={labels.resizeOverview} />
        <Panel minSize={theme.project.timelineMinHeight}>
          <div
            testId="timeline-layout"
            style={sx({
              position: "relative",
              width: "100%",
              height: "100%",
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
              backgroundColor: theme.colors.arrangementSurfaceAlt,
            })}
            onLayout={onLayout}
            onScroll={view.wheel}
          >
            <div
              style={sx({
                position: "absolute",
                left: 0,
                top: barRulerHeight,
                pointerEvents: "none",
              })}
            >
              <Grid scene={controller.sceneStore} height={trackBodyHeight} />
            </div>
            <div style={sx({ position: "absolute", left: 0, top: 0 })}>
              <Rulers owner={controller} labels={labels} />
            </div>
            <div
              style={sx({
                position: "absolute",
                left: 0,
                top: barRulerHeight,
                width: "100%",
                height: trackBodyHeight,
                overflow: "hidden",
              })}
            >
              {/* B1 rows include rulers; clipping preserves their shared viewport origin. */}
              <div
                style={sx({
                  position: "absolute",
                  left: 0,
                  top: -barRulerHeight,
                  width: "100%",
                  height: viewport.height,
                })}
              >
                {tracks}
              </div>
            </div>
            <div style={sx({ position: "absolute", left: 0, bottom: 0 })}>
              <TimeRuler scene={controller.sceneStore} label={labels.timeRuler} />
            </div>
            <div
              style={sx({
                position: "absolute",
                left: 0,
                top: 0,
                width: viewport.width,
                height: viewport.height,
                pointerEvents: "none",
              })}
            >
              {overlay}
            </div>
            {wrap ? wrap(inputSurface) : inputSurface}
            {interactionOverlay}
            <text
              role="status"
              aria-label={labels.grid}
              style={sx({
                position: "absolute",
                right: theme.layout.track.controlsWidth + theme.control["--spacing-control-gap"],
                bottom: timeRulerHeight + theme.control["--spacing-control-gap"],
                backgroundColor: theme.colors.arrangementSurfaceAlt,
                color: theme.colors.mutedForeground,
                fontSize: theme.control["--text-control-track"],
                pointerEvents: "none",
              })}
            >
              {current.gridPlan.label}
            </text>
          </div>
        </Panel>
      </Group>
      <TimelineStatus labels={labels} />
    </div>
  )
}

function TimelineStatus({ labels }: { labels: TimelineLabels }) {
  const theme = useTheme()
  const snapshot = useProjectState(state => state.session.snapshotError)
  const backend = useProjectState(state => state.session.backend)
  const error = snapshot
    ? labels.snapshotErrors[snapshot]
    : backend.error
      ? labels.backendErrors[backend.error]
      : null
  const message =
    error ??
    (backend.phase === "opening"
      ? labels.backendOpening
      : backend.phase === "pending"
        ? labels.backendPending
        : null)
  if (!message) return null
  return (
    <text
      role={error ? "alert" : "status"}
      style={sx({
        position: "absolute",
        right: theme.control["--spacing-control-gap"],
        top:
          theme.control["--spacing-control-track"] +
          theme.control["--spacing-control-track-pad"] * 2 +
          theme.control["--spacing-control-gap"],
        maxWidth: theme.layout.track.controlsWidth,
        padding: theme.control["--spacing-control-gap"],
        fontSize: theme.control["--text-control-track"],
        backgroundColor: theme.colors.arrangementSurfaceAlt,
        color: error ? theme.colors.destructive : theme.colors.mutedForeground,
        pointerEvents: "none",
      })}
    >
      {message}
    </text>
  )
}
