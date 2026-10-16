import { memo, useMemo } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Shape } from "@/shared/svg/Shape"
import type { ShapePath } from "@/shared/svg/Shape"
import { cubicAreaPath, cubicPath, polygonPath } from "@/shared/svg/paths"
import type { Point } from "@/shared/svg/paths"
import { fadeHandleX } from "../../core/clip-geometry"
import type { ClipVisualGeometry } from "../../core/clip-geometry"

interface FadeAnchor {
  id: string
  kind: "peak" | "quiet" | "curve"
  point: Point
}

export const ClipFades = memo(function ClipFades({
  id,
  geometry,
  visibleLeft,
  width,
  bodyFill,
}: {
  id: string
  geometry: ClipVisualGeometry
  visibleLeft: number
  width: number
  bodyFill: string
}) {
  const theme = useTheme()
  const top = geometry.bodyHeight ? geometry.bodyTop : geometry.top
  const height = geometry.bodyHeight || geometry.height
  const size = theme.project.arrangementFadeHandleSize
  const strokeWidth = theme.design.editor.fadeStrokeWidth
  const diamond = useMemo(() => {
    const half = size / 2
    const inset = strokeWidth / 2
    return polygonPath([
      { x: half, y: inset },
      { x: size - inset, y: half },
      { x: half, y: size - inset },
      { x: inset, y: half },
    ])
  }, [size, strokeWidth])
  const visuals = useMemo(() => {
    const masks: ShapePath[] = []
    const strokes: ShapePath[] = []
    const outside: { id: string; left: number; right: number }[] = []
    const anchors: FadeAnchor[] = []
    for (const fade of geometry.fades) {
      if (fade.active) {
        masks.push({ d: cubicAreaPath(fade.start, fade.segments, top), fill: true })
        if (fade.edge === "in" && fade.start.x > geometry.left)
          outside.push({ id: fade.edge, left: geometry.left, right: fade.start.x })
        if (fade.edge === "out" && fade.end.x < geometry.left + geometry.width)
          outside.push({ id: fade.edge, left: fade.end.x, right: geometry.left + geometry.width })
      }
      if (!fade.handlesVisible) continue
      if (fade.active) strokes.push({ d: cubicPath(fade.start, fade.segments), strokeWidth })
      anchors.push({
        id: `${fade.edge}-peak`,
        kind: "peak",
        point: fade.edge === "in" ? fade.end : fade.start,
      })
      anchors.push({
        id: `${fade.edge}-quiet`,
        kind: "quiet",
        point: fade.edge === "in" ? fade.start : fade.end,
      })
      if (fade.end.x - fade.start.x >= geometry.fadeHitSize * 2)
        anchors.push({ id: `${fade.edge}-curve`, kind: "curve", point: fade.curve })
    }
    return { masks, strokes, outside, anchors }
  }, [geometry, top, strokeWidth])
  const viewBox = `${visibleLeft} ${top} ${width} ${height}`
  const shapeStyle = sx({
    position: "absolute",
    left: 0,
    top: top - geometry.top,
    pointerEvents: "none",
  })
  return (
    <>
      {visuals.masks.length > 0 && (
        <div
          testId={`fade-mask-${id}`}
          aria-hidden
          style={sx({
            position: "absolute",
            left: 0,
            top: top - geometry.top,
            width,
            height,
            overflow: "hidden",
            pointerEvents: "none",
          })}
        >
          <Shape
            width={width}
            height={height}
            viewBox={viewBox}
            paths={visuals.masks}
            color={theme.colors.arrangementFadeMask}
            style={sx({ position: "absolute", left: 0, top: 0, pointerEvents: "none" })}
          />
          {visuals.outside.map(region => {
            const left = Math.max(visibleLeft, region.left)
            const right = Math.min(visibleLeft + width, region.right)
            return right > left ? (
              <div
                key={region.id}
                aria-hidden
                style={sx({
                  position: "absolute",
                  left: left - visibleLeft,
                  top: 0,
                  width: right - left,
                  height,
                  backgroundColor: theme.colors.arrangementFadeMask,
                  pointerEvents: "none",
                })}
              />
            ) : null
          })}
        </div>
      )}
      {visuals.strokes.length > 0 && (
        <Shape
          width={width}
          height={height}
          viewBox={viewBox}
          paths={visuals.strokes}
          color={theme.colors.arrangementClipInk}
          style={shapeStyle}
        />
      )}
      {visuals.anchors.map(anchor => (
        <div
          key={anchor.id}
          testId={`fade-${id}-${anchor.id}`}
          aria-hidden
          style={sx({
            position: "absolute",
            left:
              (anchor.kind === "curve"
                ? anchor.point.x
                : Math.round(fadeHandleX(geometry, anchor.point.x))) -
              visibleLeft -
              size / 2,
            top: Math.max(
              geometry.titleHeight,
              Math.min(
                geometry.height - size,
                (anchor.kind === "curve" ? anchor.point.y : Math.round(anchor.point.y)) -
                  geometry.top -
                  size / 2
              )
            ),
            width: size,
            height: size,
            borderWidth: anchor.kind === "curve" ? 0 : strokeWidth,
            borderColor: theme.colors.arrangementClipInk,
            backgroundColor: anchor.kind === "curve" ? undefined : bodyFill,
            pointerEvents: "none",
          })}
        >
          {anchor.kind === "curve" && (
            <>
              <Shape
                width={size}
                height={size}
                paths={[{ d: diamond, fill: true }]}
                color={bodyFill}
                style={sx({ position: "absolute", left: 0, top: 0, pointerEvents: "none" })}
              />
              <Shape
                width={size}
                height={size}
                paths={[{ d: diamond, strokeWidth }]}
                color={theme.colors.arrangementClipInk}
                style={sx({ position: "absolute", left: 0, top: 0, pointerEvents: "none" })}
              />
            </>
          )}
        </div>
      ))}
    </>
  )
})
