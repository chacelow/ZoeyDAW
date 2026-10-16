import type { GridLine } from "./grid-lines"

export const MINOR_GRID_OPACITY = 0.55

export function packGridQuads(
  lines: readonly GridLine[],
  left: number,
  width: number,
  height: number,
  majorWidth: number,
  uniform = false
): { major: Float32Array; minor: Float32Array } {
  let majorCount = 0
  let minorCount = 0
  for (const line of lines) {
    if (line.x < left || line.x >= left + width) continue
    if (uniform || line.kind === "major") majorCount++
    else minorCount++
  }
  // Native quad protocol is four floats per rectangle: x, y, width, height.
  const major = new Float32Array(majorCount * 4)
  const minor = new Float32Array(minorCount * 4)
  let majorOffset = 0
  let minorOffset = 0
  for (const line of lines) {
    if (line.x < left || line.x >= left + width) continue
    const isMajor = uniform || line.kind === "major"
    const output = isMajor ? major : minor
    const offset = isMajor ? majorOffset : minorOffset
    output[offset] = line.x - left
    output[offset + 1] = 0
    output[offset + 2] = line.kind === "major" ? majorWidth : 1
    output[offset + 3] = height
    if (isMajor) majorOffset += 4
    else minorOffset += 4
  }
  return { major, minor }
}
