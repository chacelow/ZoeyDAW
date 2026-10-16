import { useLayoutEffect, useMemo, useSyncExternalStore } from "react"
import type { StyleDesc } from "@gpuix/react"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { gridLines, patternRegions } from "../../core/rulers/grid-lines"
import { packGridQuads } from "../../core/rulers/grid-quads"
import type { SceneStore } from "../../core/scene"

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
  const minorWidth = theme.design.editor.gridMinorStrokeWidth
  const values = useMemo(
    () =>
      packGridQuads(gridLines(current), 0, current.viewport.width, height, majorWidth, minorWidth),
    [current, height, majorWidth, minorWidth]
  )
  useLayoutEffect(() => {
    major.setQuads(values.major)
    minor.setQuads(values.minor)
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
      <QuadBatch ref={minor.ref} style={sx(style, { opacity: theme.project.gridMinorOpacity })} />
    </div>
  )
}
