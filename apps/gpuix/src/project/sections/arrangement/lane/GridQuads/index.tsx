import { useLayoutEffect, useMemo } from "react"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import { useTheme } from "@/shared/theme/ThemeProvider"
import type { GridLine } from "../../core/rulers/grid-lines"

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
  const values = useMemo(() => {
    let majorCount = 0
    let minorCount = 0
    for (const line of lines) {
      if (line.x < left || line.x >= left + width) continue
      if (uniform || line.kind === "major") majorCount++
      else minorCount++
    }
    const majorValues = new Float32Array(majorCount * 4)
    const minorValues = new Float32Array(minorCount * 4)
    let majorOffset = 0
    let minorOffset = 0
    for (const line of lines) {
      if (line.x < left || line.x >= left + width) continue
      const isMajor = uniform || line.kind === "major"
      const output = isMajor ? majorValues : minorValues
      const offset = isMajor ? majorOffset : minorOffset
      output[offset] = line.x - left
      output[offset + 1] = 0
      output[offset + 2] = line.kind === "major" ? majorWidth : 1
      output[offset + 3] = height
      if (isMajor) majorOffset += 4
      else minorOffset += 4
    }
    return { major: majorValues, minor: minorValues }
  }, [lines, left, width, height, uniform, majorWidth])
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
