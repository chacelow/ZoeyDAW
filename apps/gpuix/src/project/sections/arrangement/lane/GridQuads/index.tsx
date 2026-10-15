import { useLayoutEffect, useMemo } from "react"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import { useTheme } from "@/shared/theme/ThemeProvider"
import type { GridLine } from "../../core/rulers/grid-lines"
import { packGridQuads } from "../../core/rulers/grid-quads"

export function useGridQuads(
  lines: readonly GridLine[],
  left: number,
  width: number,
  height: number,
  uniform: boolean
) {
  const theme = useTheme()
  const major = useQuadBatch()
  const minor = useQuadBatch()
  const majorWidth = theme.project.arrangementGridMajorLineWidth
  const values = useMemo(
    () => packGridQuads(lines, left, width, height, majorWidth, uniform),
    [lines, left, width, height, uniform, majorWidth]
  )
  useLayoutEffect(() => {
    major.setQuads(values.major)
    minor.setQuads(values.minor)
  }, [major, minor, values])
  const visible = width > 0 && height > 0
  return {
    majorRef: major.ref,
    minorRef: minor.ref,
    hasMajor: visible && values.major.length > 0,
    hasMinor: visible && values.minor.length > 0,
  }
}
