import { useLayoutEffect, useMemo, useSyncExternalStore } from "react"
import type { StyleDesc } from "@gpuix/react"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { gridLines, patternRegions } from "../../core/rulers/grid-lines"
import type { SceneStore } from "../../core/scene"

/** Minor grid lines stay visibly weaker than bar lines (web `painters/grid.ts`). */
export const MINOR_GRID_OPACITY = 0.55

export function PatternRegions({ scene, height }: { scene: SceneStore; height: number }) {
  const current = useSyncExternalStore(scene.subscribe, scene.get)
  const theme = useTheme()
  const base = useQuadBatch()
  const alternate = useQuadBatch()
  const values = useMemo(() => {
    const regions = patternRegions(current)
    let alternateCount = 0
    for (const region of regions) if (region.alternate) alternateCount++
    const normal = new Float32Array((regions.length - alternateCount) * 4)
    const alternating = new Float32Array(alternateCount * 4)
    let normalOffset = 0
    let alternateOffset = 0
    for (const region of regions) {
      const output = region.alternate ? alternating : normal
      const offset = region.alternate ? alternateOffset : normalOffset
      output[offset] = region.left
      output[offset + 1] = 0
      output[offset + 2] = region.width
      output[offset + 3] = height
      if (region.alternate) alternateOffset += 4
      else normalOffset += 4
    }
    return { normal, alternating }
  }, [current, height])
  useLayoutEffect(() => {
    base.setQuads(values.normal)
    alternate.setQuads(values.alternating)
  }, [base, alternate, values])
  const style = {
    position: "absolute",
    left: 0,
    top: 0,
    width: current.viewport.width,
    height,
  } satisfies StyleDesc
  return (
    <>
      <QuadBatch ref={base.ref} style={sx(style, { color: theme.colors.arrangementSurface })} />
      <QuadBatch
        ref={alternate.ref}
        style={sx(style, { color: theme.colors.arrangementSurfaceAlt })}
      />
    </>
  )
}

export function Grid({ scene, height }: { scene: SceneStore; height: number }) {
  const current = useSyncExternalStore(scene.subscribe, scene.get)
  const theme = useTheme()
  const major = useQuadBatch()
  const minor = useQuadBatch()
  const majorWidth = theme.project.arrangementGridMajorLineWidth
  const values = useMemo(() => {
    const lines = gridLines(current)
    let majorCount = 0
    for (const line of lines) if (line.kind === "major") majorCount++
    const majorValues = new Float32Array(majorCount * 4)
    const minorValues = new Float32Array((lines.length - majorCount) * 4)
    let majorOffset = 0
    let minorOffset = 0
    for (const line of lines) {
      const isMajor = line.kind === "major"
      const output = isMajor ? majorValues : minorValues
      const offset = isMajor ? majorOffset : minorOffset
      output[offset] = line.x
      output[offset + 1] = 0
      output[offset + 2] = isMajor ? majorWidth : 1
      output[offset + 3] = height
      if (isMajor) majorOffset += 4
      else minorOffset += 4
    }
    return { majorValues, minorValues }
  }, [current, height, majorWidth])
  useLayoutEffect(() => {
    major.setQuads(values.majorValues)
    minor.setQuads(values.minorValues)
  }, [major, minor, values])
  const style = {
    position: "absolute",
    left: 0,
    top: 0,
    width: current.viewport.width,
    height,
    color: theme.colors.arrangementLine,
  } satisfies StyleDesc
  return (
    <div
      testId="timeline-grid"
      style={sx({
        position: "relative",
        width: current.viewport.width,
        height,
        overflow: "hidden",
        backgroundColor: theme.colors.arrangementSurface,
        pointerEvents: "none",
      })}
    >
      <PatternRegions scene={scene} height={height} />
      <QuadBatch ref={major.ref} style={style} />
      <QuadBatch ref={minor.ref} style={sx(style, { opacity: MINOR_GRID_OPACITY })} />
    </div>
  )
}
