import { useRef, useState, useSyncExternalStore } from "react"
import { useGpuix } from "@gpuix/react"
import { Shape } from "@/shared/svg/Shape"
import { polygonPath } from "@/shared/svg/paths"
import type { ShapePath } from "@/shared/svg/Shape"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useProjectState } from "@/project/adapters"
import { timeTickLabel, timeTicks } from "@/project/model/timeline-ticks"
import {
  BAR_RULER_HEIGHT,
  LOOP_RULER_HEIGHT,
  MARKER_RULER_HEIGHT,
  TIME_RULER_HEIGHT,
} from "../../core/layout"
import { rulerTicks } from "../../core/rulers/grid-lines"
import { rulerBar, rulerHit, rulerLabel } from "../../core/rulers/geometry"
import { timelinePointer } from "../viewport/coordinates"
import { RulerMenu } from "./Menu"
import { MarkerEditor } from "./MarkerEditor"
import { PatternRegions } from "../grid"
import type { PublicInstance } from "@gpuix/react"
import type { SceneStore } from "../../core/scene"
import type { TimelineController } from "../controller"
import type { TimelineLabels } from "../labels"
import type { RulerMenuTarget } from "./Menu"

// Normalized SVG coordinate domain; screen marker dimensions come from the theme below.
const markerPaths: readonly ShapePath[] = [
  {
    d: polygonPath([
      { x: 0, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ]),
    fill: true,
  },
]

export function Rulers({ owner, labels }: { owner: TimelineController; labels: TimelineLabels }) {
  const scene = owner.sceneStore
  const current = useSyncExternalStore(scene.subscribe, scene.get)
  const theme = useTheme()
  const { renderer } = useGpuix()
  const element = useRef<PublicInstance | null>(null)
  const controller = owner.view.rulers
  const [menuTarget, setMenuTarget] = useState<RulerMenuTarget>({ kind: "ruler", bar: 1 })
  const [pointer, setPointer] = useState<"default" | "grab" | "grabbing" | "ew-resize">("default")
  const [focused, setFocused] = useState(false)
  const { width, scrollX, pxPerBar } = current.viewport
  const lines = rulerTicks(current)
  const loopLeft = (current.loop.startBar - 1) * pxPerBar - scrollX
  const loopRight = (current.loop.endBar - 1) * pxPerBar - scrollX
  const loopStart = Math.max(0, loopLeft)
  const loopWidth = Math.max(0, Math.min(width, loopRight) - loopStart)
  return (
    <RulerMenu owner={owner} labels={labels} target={menuTarget}>
      <div
        ref={element}
        testId="timeline-rulers"
        aria-label={labels.musicRuler}
        role="group"
        tabIndex={0}
        style={sx({
          position: "relative",
          width,
          height: BAR_RULER_HEIGHT,
          overflow: "hidden",
          backgroundColor: theme.colors.arrangementSurfaceAlt,
          color: theme.colors.mutedForeground,
          fontSize: theme.control["--text-control-track"],
          cursor: pointer,
          userSelect: "none",
          borderBottomWidth: 1,
          borderColor: focused ? theme.colors.ring : theme.colors.arrangementLine,
        })}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          owner.view.autoScroll.stop()
          controller.cancel()
        }}
        onMouseDown={event => {
          const bounds = element.current && renderer?.getElementBounds?.(element.current.id)
          if (!bounds) return
          const next = timelinePointer(event, bounds)
          const projection = scene.get()
          const hit = rulerHit(projection, next)
          if (!hit) return
          if (hit.kind === "marker") setMenuTarget({ kind: "marker", id: hit.marker.id })
          else if (hit.kind === "loop") setMenuTarget({ kind: "loop" })
          else
            setMenuTarget({
              kind: "ruler",
              bar: rulerBar(
                projection,
                next.x,
                useProjectState.getState().workspace.snap,
                next.shiftKey
              ),
            })
          owner.view.autoScroll.stop()
          if (event.button === 2 || event.modifiers?.ctrl) {
            controller.cancel()
            if (hit.kind === "marker")
              scene.setTargetSelection({ kind: "marker", id: hit.marker.id, phase: "selected" })
            else if (hit.kind === "loop") scene.setTargetSelection({ kind: "loop" })
            return
          }
          owner.view.suspendFollow()
          if ((event.clickCount ?? 1) >= 2) controller.doubleClick(next.x, next.y, next.shiftKey)
          else if (controller.down(next.x, next.y, next.shiftKey, next.button))
            owner.view.autoScroll.start(next, "horizontal")
        }}
        onMouseMove={event => {
          const bounds = element.current && renderer?.getElementBounds?.(element.current.id)
          if (!bounds) return
          const next = timelinePointer(event, bounds)
          if (controller.active) {
            controller.move(next.x, next.shiftKey)
            owner.view.autoScroll.update(next)
          }
          const hit = rulerHit(scene.get(), next)
          setPointer(
            hit?.kind === "marker" || (hit?.kind === "loop" && hit.edge === "body")
              ? controller.active
                ? "grabbing"
                : "grab"
              : hit?.kind === "loop"
                ? "ew-resize"
                : "default"
          )
        }}
        onMouseUp={() => {
          owner.view.autoScroll.stop()
          controller.up()
        }}
      >
        <PatternRegions scene={scene} height={BAR_RULER_HEIGHT} />
        {lines.map(line => (
          <div
            key={line.bar}
            testId={`ruler-position-${line.bar}`}
            style={sx({
              position: "absolute",
              left: line.x + theme.control["--spacing-control-gap"],
              top: MARKER_RULER_HEIGHT,
              height: LOOP_RULER_HEIGHT,
              display: "flex",
              alignItems: "center",
              pointerEvents: "none",
            })}
          >
            {rulerLabel(line.bar, current.transport.numerator, current.transport.denominator)}
          </div>
        ))}
        {current.markers
          .filter(marker => {
            const x = (marker.bar - 1) * pxPerBar - scrollX
            return x >= 0 && x < width
          })
          .map(marker => (
            <div
              key={marker.id}
              testId={`ruler-marker-${marker.id}`}
              style={sx({
                position: "absolute",
                top: 0,
                left: (marker.bar - 1) * pxPerBar - scrollX,
                height: MARKER_RULER_HEIGHT,
                display: "flex",
                alignItems: "center",
                paddingLeft: theme.project.arrangementMarkerLabelInset - 1,
                pointerEvents: "none",
                borderLeftWidth: 1,
                borderColor:
                  current.targetSelection.kind === "marker" &&
                  current.targetSelection.id === marker.id
                    ? theme.colors.primary
                    : "transparent",
                color:
                  current.targetSelection.kind === "marker" &&
                  current.targetSelection.id === marker.id
                    ? theme.colors.foreground
                    : theme.colors.mutedForeground,
              })}
            >
              <Shape
                paths={markerPaths}
                viewBox="0 0 6 4"
                width={theme.project.arrangementMarkerWidth}
                height={theme.project.arrangementMarkerHeight}
                color={theme.colors.primary}
                style={sx({
                  position: "absolute",
                  left: 0,
                  bottom: theme.project.arrangementMarkerInset,
                  pointerEvents: "none",
                })}
              />
              {marker.label}
            </div>
          ))}
        {current.loop.enabled && loopWidth > 0 && (
          <div
            testId="ruler-loop"
            style={sx({
              position: "absolute",
              left: loopStart,
              top: MARKER_RULER_HEIGHT,
              width: loopWidth,
              height: LOOP_RULER_HEIGHT,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: theme.colors.primary,
              backgroundColor: theme.colors.canvasScrollbarActive,
              pointerEvents: "none",
            })}
          />
        )}
        <MarkerEditor owner={owner} labels={labels} />
      </div>
    </RulerMenu>
  )
}

export function TimeRuler({ scene, label }: { scene: SceneStore; label: string }) {
  const current = useSyncExternalStore(scene.subscribe, scene.get)
  const theme = useTheme()
  const { width, pxPerBar, scrollX } = current.viewport
  const ticks = timeTicks({
    bars: current.bars,
    visibleStartBar: 1 + scrollX / pxPerBar,
    visibleEndBar: 1 + (scrollX + width) / pxPerBar,
    pxPerBar,
    ...current.transport,
  })
  return (
    <div
      role="group"
      aria-label={label}
      testId="timeline-time-ruler"
      style={sx({
        width,
        height: TIME_RULER_HEIGHT,
        position: "relative",
        overflow: "hidden",
        backgroundColor: theme.colors.arrangementSurfaceAlt,
        color: theme.colors.mutedForeground,
        fontSize: theme.control["--text-control-track"],
        borderTopWidth: 1,
        borderColor: theme.colors.arrangementLine,
        userSelect: "none",
      })}
    >
      {ticks.map(tick => (
        <div
          key={tick.value}
          style={sx({
            position: "absolute",
            top: 0,
            left: tick.left - scrollX,
            height: TIME_RULER_HEIGHT,
            display: "flex",
            alignItems: "center",
            paddingLeft: theme.design.spacing.stackGap,
            pointerEvents: "none",
          })}
        >
          <div
            style={sx({
              position: "absolute",
              left: 0,
              top: 0,
              width: 1,
              height: theme.control["--spacing-control-track-gap"],
              backgroundColor: theme.colors.arrangementLine,
              pointerEvents: "none",
            })}
          />
          {timeTickLabel(tick.value)}
        </div>
      ))}
    </div>
  )
}
