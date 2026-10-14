import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "../../../../../shared/theme/ThemeProvider"
import { sx } from "../../../../../shared/theme/style"
import { formatAudioMusicalValue } from "../../../../model/audio-editor/musical-value"
import { timeTickLabel, timeTicks } from "../../../../model/timeline-ticks"
import {
  BAR_RULER_HEIGHT,
  LOOP_RULER_HEIGHT,
  MARKER_RULER_HEIGHT,
  TIME_RULER_HEIGHT,
} from "../../core/layout"
import { gridLines } from "../../core/rulers/grid-lines"
import { createRulerController } from "./controller"
import { PatternRegions } from "../grid"
import type { PublicInstance } from "@gpuix/react"
import type { SceneStore } from "../../core/scene"

export function Rulers({ scene, label }: { scene: SceneStore; label: string }) {
  const current = useSyncExternalStore(scene.subscribe, scene.get)
  const theme = useTheme()
  const { renderer } = useGpuix()
  const element = useRef<PublicInstance | null>(null)
  const controller = useMemo(() => createRulerController(scene), [scene])
  useEffect(() => () => controller.dispose(), [controller])
  const { width, scrollX, pxPerBar } = current.viewport
  const lines = gridLines(current).filter(line => line.kind === "major")
  const loopLeft = (current.loop.startBar - 1) * pxPerBar - scrollX
  const loopRight = (current.loop.endBar - 1) * pxPerBar - scrollX
  const loopStart = Math.max(0, loopLeft)
  const loopWidth = Math.max(0, Math.min(width, loopRight) - loopStart)
  return (
    <div
      ref={element}
      testId="timeline-rulers"
      aria-label={label}
      role="group"
      tabIndex={0}
      style={sx({
        position: "relative",
        width,
        height: BAR_RULER_HEIGHT,
        overflow: "hidden",
        backgroundColor: theme.colors.editorShell,
        color: theme.colors.mutedForeground,
        fontSize: theme.control["--text-control-track"],
        cursor: "default",
      })}
      onMouseDown={event => {
        const bounds = element.current && renderer?.getElementBounds?.(element.current.id)
        if (!bounds) return
        const x = (event.x ?? bounds.x) - bounds.x
        const y = (event.y ?? bounds.y) - bounds.y
        if ((event.clickCount ?? 1) >= 2) controller.doubleClick(x, y, event.modifiers?.shift)
        else controller.down(x, y, event.modifiers?.shift, event.button)
      }}
      onMouseMove={event => {
        const bounds = element.current && renderer?.getElementBounds?.(element.current.id)
        if (bounds) controller.move((event.x ?? bounds.x) - bounds.x, event.modifiers?.shift)
      }}
      onMouseUp={() => controller.up()}
      onKeyDown={event => controller.keyDown(event)}
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
          {formatAudioMusicalValue(
            line.bar - 1,
            current.transport.numerator,
            current.transport.denominator,
            "position"
          )
            .replace(/\.1$/, "")
            .replace(/\.1$/, "")}
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
              pointerEvents: "none",
              color:
                current.targetSelection.kind === "marker" &&
                current.targetSelection.id === marker.id
                  ? theme.colors.foreground
                  : theme.colors.mutedForeground,
            })}
          >
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
    </div>
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
        backgroundColor: theme.colors.editorShell,
        color: theme.colors.mutedForeground,
        fontSize: theme.control["--text-control-track"],
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
          })}
        >
          {timeTickLabel(tick.value)}
        </div>
      ))}
    </div>
  )
}
