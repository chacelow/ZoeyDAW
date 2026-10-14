import { useSyncExternalStore } from "react"
import { useTheme } from "../../../../../shared/theme/ThemeProvider"
import { sx } from "../../../../../shared/theme/style"
import { gridLines, patternRegions } from "../../core/rulers/grid-lines"
import type { SceneStore } from "../../core/scene"

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
              ? theme.colors.scrollbarTrack
              : theme.colors.editorShell,
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
        backgroundColor: theme.colors.editorShell,
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
            width: line.kind === "major" ? theme.project.trackBorder : 1,
            height,
            backgroundColor:
              line.kind === "major" ? theme.colors.canvasScrollbarActive : theme.colors.border,
            pointerEvents: "none",
          })}
        />
      ))}
    </div>
  )
}
