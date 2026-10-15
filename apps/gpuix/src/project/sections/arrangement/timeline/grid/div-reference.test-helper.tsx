import { useSyncExternalStore } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { gridLines, patternRegions } from "../../core/rulers/grid-lines"
import type { SceneStore } from "../../core/scene"
import { MINOR_GRID_OPACITY } from "./index"

export function PatternRegions({ scene, height }: { scene: SceneStore; height: number }) {
  const current = useSyncExternalStore(scene.subscribe, scene.get)
  const theme = useTheme()
  return (
    <>
      {patternRegions(current).map(region => (
        <div
          key={region.bar}
          testId={`pattern-region-${region.bar}`}
          style={sx({
            position: "absolute",
            left: region.left,
            top: 0,
            width: region.width,
            height,
            backgroundColor: region.alternate
              ? theme.colors.arrangementSurfaceAlt
              : theme.colors.arrangementSurface,
            pointerEvents: "none",
          })}
        />
      ))}
    </>
  )
}

export function Grid({ scene, height }: { scene: SceneStore; height: number }) {
  const current = useSyncExternalStore(scene.subscribe, scene.get)
  const theme = useTheme()
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
      {gridLines(current).map(line => (
        <div
          key={`${line.kind}:${line.bar}`}
          testId={`grid-${line.kind}-${line.bar}`}
          style={sx({
            position: "absolute",
            left: line.x,
            top: 0,
            width: line.kind === "major" ? theme.project.arrangementGridMajorLineWidth : 1,
            height,
            backgroundColor: theme.colors.arrangementLine,
            opacity: line.kind === "major" ? 1 : MINOR_GRID_OPACITY,
            pointerEvents: "none",
          })}
        />
      ))}
    </div>
  )
}
