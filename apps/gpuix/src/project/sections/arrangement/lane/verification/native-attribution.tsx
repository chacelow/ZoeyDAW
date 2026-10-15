import { useLayoutEffect, useMemo } from "react"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { contentFill, resolveContentColor } from "@/shared/theme/content-color"
import { sx } from "@/shared/theme/style"
import type { RenderClipCard } from "../clip-card-projection"

const EMPTY = new Float32Array(0)

export function useNativeAttribution(
  cards: readonly RenderClipCard[],
  trackColor: string,
  width: number,
  height: number
) {
  const mode = process.env.LANE_NATIVE_ATTRIBUTION
  const theme = useTheme()
  const title = useQuadBatch()
  const body = useQuadBatch()
  const grid = useQuadBatch()
  const token = cards[0]?.clip.color ?? trackColor
  const values = useMemo(() => {
    if (mode !== "merge-divs" && mode !== "merge-batches")
      return { title: EMPTY, body: EMPTY, grid: EMPTY }
    const titles: number[] = []
    const bodies: number[] = []
    const lines: number[] = []
    for (const card of cards) {
      if (card.ghost || card.selected || card.hovered || (card.clip.color ?? trackColor) !== token)
        throw new Error("Native attribution requires the unchanged unselected verification fixture")
      const g = card.geometry
      const left = Math.max(0, g.left)
      const right = Math.min(width, g.left + g.width)
      if (g.bodyHeight <= 0)
        throw new Error("Native fill attribution requires expanded verification Clips")
      titles.push(left, g.top, right - left, g.titleHeight)
      bodies.push(left, g.bodyTop, right - left, g.bodyHeight)
      if (mode === "merge-batches") {
        for (const line of card.grid) {
          if (line.x < left || line.x >= right) continue
          lines.push(
            line.x,
            g.bodyTop,
            line.kind === "major" ? theme.project.arrangementGridMajorLineWidth : 1,
            g.bodyHeight
          )
        }
      }
    }
    return {
      title: new Float32Array(titles),
      body: new Float32Array(bodies),
      grid: new Float32Array(lines),
    }
  }, [cards, mode, trackColor, token, width, theme.project.arrangementGridMajorLineWidth])
  useLayoutEffect(() => {
    title.setQuads(values.title)
    body.setQuads(values.body)
    grid.setQuads(values.grid)
  }, [title, body, grid, values])
  return (
    <>
      {values.title.length > 0 && (
        <QuadBatch
          ref={title.ref}
          aria-hidden
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            color: resolveContentColor(token, theme.colors),
            pointerEvents: "none",
          })}
        />
      )}
      {values.body.length > 0 && (
        <QuadBatch
          ref={body.ref}
          aria-hidden
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            color: contentFill(token, theme.colors),
            opacity: 0.55,
            pointerEvents: "none",
          })}
        />
      )}
      {values.grid.length > 0 && (
        <QuadBatch
          ref={grid.ref}
          aria-hidden
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            color: theme.colors.arrangementLine,
            opacity: 0.4,
            pointerEvents: "none",
          })}
        />
      )}
    </>
  )
}
