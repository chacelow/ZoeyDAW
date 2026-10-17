import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useProjectState } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { minimapHit } from "../../core/viewport/minimap"
import { createMinimapGesture } from "./gesture"
import { Overview } from "./Overview"
import { Playhead } from "./Playhead"
import type { PublicInstance } from "@gpuix/react"
import type { MinimapGeometry } from "../../core/viewport/minimap"
import type { MinimapViewport } from "../../core/viewport/zoom"
import type { CursorLockPort } from "@/ui/controls"
import type { MinimapGesture } from "./gesture"

export interface MiniMapProps {
  geometry: MinimapGeometry
  width: number
  height: number
  label: string
  cursor: CursorLockPort | undefined
  onNavigate: () => void
  onViewport: (viewport: MinimapViewport) => void
  onFit: () => void
  registerGesture?: (gesture: MinimapGesture) => () => void
}

export function MiniMap({
  geometry,
  width,
  height,
  label,
  cursor,
  onNavigate,
  onViewport,
  onFit,
  registerGesture,
}: MiniMapProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const element = useRef<PublicInstance | null>(null)
  const [pointer, setPointer] = useState<"grab" | "horizontalResize">("grab")
  const [hovered, setHovered] = useState(false)
  const [phase, setPhase] = useState<MinimapGesture["phase"]>("idle")
  const latest = useRef({ geometry, width, onNavigate, onViewport })
  useLayoutEffect(() => {
    latest.current = { geometry, width, onNavigate, onViewport }
  }, [geometry, width, onNavigate, onViewport])
  const epoch = useProjectState(state => state.session.editEpoch)
  const gesture = useMemo(
    () =>
      createMinimapGesture({
        read() {
          const bounds = element.current && renderer?.getElementBounds?.(element.current.id)
          return {
            ...latest.current,
            left: bounds?.x ?? 0,
            epoch: useProjectState.getState().session.editEpoch,
          }
        },
        publish: viewport => latest.current.onViewport(viewport),
        navigate: () => latest.current.onNavigate(),
        cursor,
        onPhaseChange: setPhase,
      }),
    [renderer, cursor]
  )
  useEffect(() => () => gesture.dispose(), [gesture])
  useLayoutEffect(() => {
    gesture.cancel()
  }, [epoch, gesture])
  useEffect(() => registerGesture?.(gesture), [gesture, registerGesture])
  const viewportBars = Math.min(geometry.bars, geometry.viewportWidth / geometry.pxPerBar)
  const start = Math.max(
    0,
    Math.min(geometry.bars - viewportBars, geometry.scrollX / geometry.pxPerBar)
  )
  return (
    <div
      ref={element}
      testId="timeline-minimap"
      role="group"
      aria-label={label}
      tabIndex={0}
      style={sx({
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: theme.colors.arrangementSurfaceAlt,
        cursor: theme.design.cursors[pointer],
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={event => {
        if (event.button !== undefined && event.button !== 0) return
        if ((event.clickCount ?? 1) >= 2) {
          gesture.up()
          onFit()
        } else if (event.x !== undefined && event.y !== undefined) {
          gesture.down({ x: event.x, y: event.y }, event.button)
        }
      }}
      onMouseMove={event => {
        gesture.move({ x: event.x ?? 0, y: event.y ?? 0 })
        if (gesture.phase !== "idle" || !element.current) return
        const bounds = renderer?.getElementBounds?.(element.current.id)
        if (!bounds) return
        const hit = minimapHit((event.x ?? bounds.x) - bounds.x, width, geometry)
        setPointer(hit === "left" || hit === "right" ? "horizontalResize" : "grab")
      }}
      onMouseUp={() => gesture.up()}
      onBlur={() => gesture.cancel()}
      onKeyDown={event => {
        if (event.key === "escape" && gesture.phase !== "idle") {
          gesture.cancel()
          event.preventDefault()
          event.stopPropagation()
        } else if (event.key === "enter") {
          gesture.up()
          onFit()
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <Overview bars={geometry.bars} width={width} height={height} />
      <Playhead bars={geometry.bars} width={width} height={height} />
      <div
        testId="minimap-frame"
        style={sx({
          position: "absolute",
          top: 0,
          left: (start / geometry.bars) * width,
          width: (viewportBars / geometry.bars) * width,
          height,
          borderWidth: theme.design.shape.controlBorderWidth,
          borderColor: theme.colors.border,
          backgroundColor:
            viewportBars >= geometry.bars
              ? "transparent"
              : phase !== "idle"
                ? theme.colors.canvasScrollbarActive
                : hovered
                  ? theme.colors.canvasScrollbarHover
                  : theme.colors.canvasScrollbar,
          pointerEvents: "none",
        })}
      />
    </div>
  )
}
