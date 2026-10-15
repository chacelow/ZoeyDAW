import { inflateSync } from "node:zlib"

export interface NativePng {
  width: number
  height: number
  rgba: Buffer
}

export function decodeNativePng(png: Buffer): NativePng {
  if (
    png.subarray(1, 4).toString() !== "PNG" ||
    png.readUInt8(24) !== 8 ||
    png.readUInt8(25) !== 6 ||
    png.readUInt8(28) !== 0
  )
    throw new Error("Native capture must be non-interlaced RGBA8 PNG")
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const chunks: Buffer[] = []
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset)
    if (offset + length + 12 > png.length) throw new Error("Truncated native PNG chunk")
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
      chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  if (raw.length !== (stride + 1) * height) throw new Error("Unexpected native PNG scanline length")
  const rgba = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const row = y * stride
    const input = y * (stride + 1)
    const filter = raw.readUInt8(input)
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba.readUInt8(row + x - 4) : 0
      const above = y > 0 ? rgba.readUInt8(row + x - stride) : 0
      const diagonal = y > 0 && x >= 4 ? rgba.readUInt8(row + x - stride - 4) : 0
      let predictor: number
      switch (filter) {
        case 0:
          predictor = 0
          break
        case 1:
          predictor = left
          break
        case 2:
          predictor = above
          break
        case 3:
          predictor = Math.floor((left + above) / 2)
          break
        case 4: {
          const p = left + above - diagonal
          const a = Math.abs(p - left)
          const b = Math.abs(p - above)
          const c = Math.abs(p - diagonal)
          predictor = a <= b && a <= c ? left : b <= c ? above : diagonal
          break
        }
        default:
          throw new Error(`Unsupported native PNG filter ${filter}`)
      }
      rgba.writeUInt8((raw.readUInt8(input + 1 + x) + predictor) & 255, row + x)
    }
  }
  return { width, height, rgba }
}
