export const VIEWPORT = { width: 976, height: 758 }
export const PROJECT = { tracks: 50, clipsPerTrack: 50, rowHeight: 36, clipWidth: 192 }
export const STEPS = [
  { x: 480, y: 0, zoom: 1 },
  { x: 480, y: 360, zoom: 1 },
  { x: 1000, y: 360, zoom: 1 },
  { x: 1000, y: 780, zoom: 1 },
  { x: 1000, y: 780, zoom: 1.25 },
  { x: 1600, y: 780, zoom: 1.25 },
  { x: 1600, y: 340, zoom: 1.25 },
  { x: 1600, y: 340, zoom: 1 },
  { x: 1100, y: 340, zoom: 1 },
  { x: 1100, y: 0, zoom: 1 },
]

export type ViewportState = (typeof STEPS)[number]
export function geometry({ x, y, zoom }: ViewportState) {
  const grid = new Float32Array(1565 * 4)
  const notes = new Float32Array(2500 * 4)
  const peaks = new Float32Array(10000 * 4)
  let g = 0
  let n = 0
  let p = 0
  const set = (
    buffer: Float32Array,
    offset: number,
    left: number,
    top: number,
    width: number,
    height: number
  ) => {
    buffer[offset] = left * zoom - x
    buffer[offset + 1] = top - y
    buffer[offset + 2] = width * zoom
    buffer[offset + 3] = height
  }
  for (let row = 0; row < PROJECT.tracks; row++) {
    for (let line = 0; line < 31; line++) {
      set(grid, g, line * 32, row * PROJECT.rowHeight, 1, PROJECT.rowHeight)
      g += 4
    }
    for (let clip = 0; clip < PROJECT.clipsPerTrack; clip++) {
      const left = clip * PROJECT.clipWidth
      const top = row * PROJECT.rowHeight
      if ((row + clip) % 2 === 0) {
        for (let column = 0; column < 8; column++) {
          const amplitude = 3 + ((column * 7 + clip * 3 + row) % 12)
          set(peaks, p, left + column * 23, top + 18 - amplitude, 1, amplitude * 2)
          p += 4
        }
      } else {
        for (let note = 0; note < 2; note++) {
          set(notes, n, left + note * 48, top + 6 + ((clip + row + note * 5) % 22), 44, 2)
          n += 4
        }
      }
    }
  }
  for (let line = 0; line < 15; line++) {
    set(grid, g, 0, line * PROJECT.rowHeight, 976, 1)
    g += 4
  }
  return { grid, notes, peaks }
}

export function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    count: sorted.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p90Ms: sorted[Math.ceil(sorted.length * 0.9) - 1],
    maxMs: sorted.at(-1),
  }
}
