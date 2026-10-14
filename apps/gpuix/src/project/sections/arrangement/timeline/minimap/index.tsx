import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useProjectState } from "../../../../adapters"
import { positionToBar } from "../../../../model/types"
import { useTheme } from "../../../../../shared/theme/ThemeProvider"
import { sx } from "../../../../../shared/theme/style"
import { clipRect } from "../../core/layout"
import { minimapHit } from "../../core/viewport/minimap"
import { createMinimapGesture } from "./gesture"
import type { PublicInstance } from "@gpuix/react"
import type { MinimapGeometry } from "../../core/viewport/minimap"
import type { MinimapViewport } from "../../core/viewport/zoom"
import type { CursorPort } from "./gesture"

export interface MiniMapProps {
  geometry: MinimapGeometry
  width: number
  height: number
  label: string
  cursor: CursorPort
  onNavigate: () => void
  onViewport: (viewport: MinimapViewport) => void
}

export function MiniMap({
  geometry,
  width,
  height,
  label,
  cursor,
  onNavigate,
  onViewport,
}: MiniMapProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const element = useRef<PublicInstance | null>(null)
  const [pointer, setPointer] = useState<"grab" | "ew-resize">("grab")
  const latest = useRef({ geometry, width, onNavigate, onViewport })
  useLayoutEffect(() => {
    latest.current = { geometry, width, onNavigate, onViewport }
  }, [geometry, width, onNavigate, onViewport])
  const tracks = useProjectState(state => state.document.tracks)
  const markers = useProjectState(state => state.document.markers)
  const position = useProjectState(state =>
    positionToBar(state.session.position, state.document.transport.numerator)
  )
  const gesture = useMemo(
    () =>
      createMinimapGesture({
        read() {
          const bounds = element.current && renderer?.getElementBounds?.(element.current.id)
          return { ...latest.current, left: bounds?.x ?? 0 }
        },
        publish: viewport => latest.current.onViewport(viewport),
        navigate: () => latest.current.onNavigate(),
        cursor,
      }),
    [renderer, cursor]
  )
  useEffect(() => () => gesture.dispose(), [gesture])
  const rows = tracks.filter(track => track.kind !== "return" && track.kind !== "main")
  const rowHeight = height / Math.max(1, rows.length)
  const viewportBars = Math.min(geometry.bars, geometry.viewportWidth / geometry.pxPerBar)
  const start = Math.max(
    0,
    Math.min(geometry.bars - viewportBars, geometry.scrollX / geometry.pxPerBar)
  )
  const contentColors: Readonly<Record<string, string>> = {
    "var(--chart-1)": theme.colors.chart1,
    "var(--chart-2)": theme.colors.chart2,
    "var(--chart-3)": theme.colors.chart3,
    "var(--chart-4)": theme.colors.chart4,
    "var(--chart-5)": theme.colors.chart5,
  }
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
        backgroundColor: theme.colors.editorShell,
        cursor: pointer,
      })}
      onMouseDown={event => {
        if ((event.clickCount ?? 1) >= 2) gesture.fit()
        else gesture.down({ x: event.x ?? 0, y: event.y ?? 0 }, event.button)
      }}
      onMouseMove={event => {
        gesture.move({ x: event.x ?? 0, y: event.y ?? 0 })
        if (gesture.phase !== "idle" || !element.current) return
        const bounds = renderer?.getElementBounds?.(element.current.id)
        if (!bounds) return
        const hit = minimapHit((event.x ?? bounds.x) - bounds.x, width, geometry)
        setPointer(hit === "left" || hit === "right" ? "ew-resize" : "grab")
      }}
      onMouseUp={() => gesture.up()}
      onKeyDown={event => {
        if (event.key === "escape") gesture.cancel()
        if (event.key === "enter") gesture.fit()
      }}
    >
      {rows.map((track, index) => (
        <div
          key={track.id}
          style={sx({
            position: "absolute",
            left: 0,
            top: index * rowHeight,
            width,
            height: rowHeight,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            pointerEvents: "none",
          })}
        >
          {track.clips.map(clip => {
            const rect = clipRect(
              clip,
              { track, top: 0, height: rowHeight },
              width / geometry.bars,
              0
            )
            return (
              <div
                key={clip.id}
                style={sx({
                  position: "absolute",
                  left: rect.left,
                  top: 0,
                  width: rect.width,
                  height: Math.max(1, rowHeight - 1),
                  backgroundColor:
                    contentColors[clip.color ?? track.color] ?? clip.color ?? track.color,
                  pointerEvents: "none",
                })}
              />
            )
          })}
        </div>
      ))}
      {markers.map(marker => (
        <div
          key={marker.id}
          style={sx({
            position: "absolute",
            top: 0,
            left: ((marker.bar - 1) / geometry.bars) * width,
            width: 1,
            height,
            backgroundColor: theme.colors.mutedForeground,
            pointerEvents: "none",
          })}
        />
      ))}
      <div
        style={sx({
          position: "absolute",
          top: 0,
          left: ((position - 1) / geometry.bars) * width,
          width: 1,
          height,
          backgroundColor: theme.colors.foreground,
          pointerEvents: "none",
        })}
      />
      <div
        testId="minimap-frame"
        style={sx({
          position: "absolute",
          top: 0,
          left: (start / geometry.bars) * width,
          width: (viewportBars / geometry.bars) * width,
          height,
          borderWidth: 1,
          borderColor: theme.colors.mutedForeground,
          backgroundColor: theme.colors.canvasScrollbar,
          pointerEvents: "none",
        })}
      />
    </div>
  )
}
