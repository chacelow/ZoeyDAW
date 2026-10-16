import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { decodeNativePng } from "@/shared/waveform/testing/native-png"

const [before, after, xArg, yArg, widthArg, heightArg] = process.argv.slice(2)
if (!before || !after || !xArg || !yArg || !widthArg || !heightArg)
  throw new Error("Usage: compare-config-pixels.ts before after x y width height")
const [x, y, width, height] = [xArg, yArg, widthArg, heightArg].map(Number)
if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0)
  throw new Error("Comparison rectangle must be positive integer geometry")
const frames = readdirSync(before)
  .filter(name => name.endsWith(".png"))
  .sort((a, b) => a.localeCompare(b))
const afterFrames = readdirSync(after)
  .filter(name => name.endsWith(".png"))
  .sort((a, b) => a.localeCompare(b))
if (frames.length === 0 || JSON.stringify(frames) !== JSON.stringify(afterFrames))
  throw new Error("Native frame capture sets differ")
const comparisons = frames.map(name => {
  const previous = decodeNativePng(readFileSync(path.join(before, name)))
  const current = decodeNativePng(readFileSync(path.join(after, name)))
  if (
    current.width !== previous.width ||
    current.height !== previous.height ||
    x + width > current.width ||
    y + height > current.height
  )
    throw new Error(`Invalid comparison geometry: ${name}`)
  let changedPixels = 0
  let outsidePixels = 0
  // Native PNG buffers use the RGBA8 protocol: exactly four bytes per pixel.
  for (let offset = 0; offset < previous.rgba.length; offset += 4) {
    if (
      previous.rgba.subarray(offset, offset + 4).equals(current.rgba.subarray(offset, offset + 4))
    )
      continue
    const pixel = offset / 4
    const column = pixel % current.width
    const row = Math.floor(pixel / current.width)
    if (column >= x && column < x + width && row >= y && row < y + height) changedPixels++
    else outsidePixels++
  }
  return { name, changedPixels, outsidePixels }
})
process.stdout.write(`${JSON.stringify({ rectangle: { x, y, width, height }, comparisons })}\n`)
if (comparisons.some(frame => frame.changedPixels !== 0))
  throw new Error("Arrangement default configuration changed native pixels")
