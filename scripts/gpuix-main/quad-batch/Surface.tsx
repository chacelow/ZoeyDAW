import { useLayoutEffect } from "react"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { geometry, VIEWPORT, type ViewportState } from "./workload"

export function Surface({ mode, viewport }: { mode: "div" | "quad"; viewport: ViewportState }) {
  const theme = useTheme()
  const grid = useQuadBatch()
  const notes = useQuadBatch()
  const peaks = useQuadBatch()
  const data = geometry(viewport)
  useLayoutEffect(() => {
    grid.setQuads(data.grid)
    notes.setQuads(data.notes)
    peaks.setQuads(data.peaks)
  }, [data, grid, notes, peaks])
  const batches = [
    { name: "grid", controller: grid, values: data.grid, color: theme.colors.border },
    { name: "notes", controller: notes, values: data.notes, color: theme.colors.foreground },
    { name: "peaks", controller: peaks, values: data.peaks, color: theme.colors.accent },
  ]
  return (
    <div
      style={sx({
        position: "relative",
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        overflow: "hidden",
        backgroundColor: theme.colors.background,
      })}
    >
      {batches.map(({ name, controller, values, color }) =>
        mode === "quad" ? (
          <QuadBatch
            key={name}
            ref={controller.ref}
            style={sx({
              position: "absolute",
              left: 0,
              top: 0,
              width: VIEWPORT.width,
              height: VIEWPORT.height,
              color,
            })}
          />
        ) : (
          Array.from({ length: values.length / 4 }, (_, index) => (
            <div
              key={`${name}-${index}`}
              style={sx({
                position: "absolute",
                left: values[index * 4],
                top: values[index * 4 + 1],
                width: values[index * 4 + 2],
                height: values[index * 4 + 3],
                backgroundColor: color,
                pointerEvents: "none",
              })}
            />
          ))
        )
      )}
    </div>
  )
}
