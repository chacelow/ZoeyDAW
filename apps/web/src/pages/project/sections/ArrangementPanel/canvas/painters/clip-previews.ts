import type { AudioClip, Clip, MidiClip, PatternClip } from "@/pages/project/model/types"
import { PATTERN_STEPS_PER_BAR } from "@/pages/project/model/types"
import { patternHasActivity, patternWindow } from "@/pages/project/model/pattern-window"

function clipLoopBars(clip: Clip): number | null {
  if (clip.kind === "midi") return clip.loopBars ?? clip.lengthBars
  if (clip.kind === "pattern")
    return (clip.steps?.length || PATTERN_STEPS_PER_BAR) / PATTERN_STEPS_PER_BAR
  if (clip.samplePath === "mock://kick.wav") return 16
  if (clip.samplePath === "mock://untitled.wav") return 1
  return null
}

/** Mark source-cycle boundaries, irrespective of the current trim or scroll position. */
export function paintClipLoopTicks(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  left: number,
  top: number,
  width: number,
  viewportWidth: number,
  ink: string
): void {
  const period = clipLoopBars(clip)
  if (!period || width <= 0 || (period / clip.lengthBars) * width < 2) return
  const sourceStart = clip.sourceOffsetBars ?? 0
  const from = sourceStart + (Math.max(0, -left) / width) * clip.lengthBars
  const through = sourceStart + (Math.min(width, viewportWidth - left) / width) * clip.lengthBars
  if (through <= from) return
  const opacity = ctx.globalAlpha
  ctx.fillStyle = ink
  ctx.globalAlpha = opacity * 0.85
  for (let cycle = Math.floor(from / period) + 1; cycle * period < through; cycle++) {
    const x = left + ((cycle * period - sourceStart) / clip.lengthBars) * width
    if (x > left + 1 && x < left + width - 1) ctx.fillRect(Math.round(x), top, 1, 5)
  }
  ctx.globalAlpha = opacity
}

export function paintWaveform(
  ctx: CanvasRenderingContext2D,
  clip: AudioClip,
  left: number,
  top: number,
  width: number,
  height: number,
  ink: string,
  viewportWidth: number
): void {
  const peaks = clip.waveformPeaks
  if (!peaks?.length || height <= 0) return
  const start = Math.max(0, Math.ceil(-left))
  const end = Math.min(Math.ceil(width), Math.ceil(viewportWidth - left))
  if (end <= start) return
  const mid = top + height / 2
  const amplitude = Math.max(0, height / 2 - 1)
  const opacity = ctx.globalAlpha
  ctx.strokeStyle = ink
  ctx.globalAlpha = opacity
  ctx.beginPath()
  for (let i = start; i < end; i++) {
    const index = Math.min(peaks.length - 1, Math.floor((i / width) * peaks.length))
    const extent = Math.min(1, Math.abs(peaks[index])) * amplitude
    const x = left + i + 0.5
    ctx.moveTo(x, mid - extent)
    ctx.lineTo(x, mid + extent)
  }
  ctx.stroke()
  ctx.globalAlpha = opacity
}

export function paintMidiNotes(
  ctx: CanvasRenderingContext2D,
  clip: MidiClip,
  left: number,
  top: number,
  width: number,
  height: number,
  ink: string,
  numerator: number,
  viewportWidth: number
): void {
  if (!clip.notes.length || height <= 0 || width <= 0) return
  const sourceStart = (clip.sourceOffsetBars ?? 0) * numerator
  const sourceLength = clip.lengthBars * numerator
  const cycle = (clip.loopBars ?? clip.lengthBars) * numerator
  const visibleStart = sourceStart + (Math.max(0, -left) / width) * sourceLength
  const visibleEnd = sourceStart + (Math.min(width, viewportWidth - left) / width) * sourceLength
  if (visibleEnd <= visibleStart) return
  let minPitch = Infinity
  let maxPitch = -Infinity
  for (const note of clip.notes) {
    minPitch = Math.min(minPitch, note.pitch)
    maxPitch = Math.max(maxPitch, note.pitch)
  }
  const pitchSpan = Math.max(1, maxPitch - minPitch)
  const opacity = ctx.globalAlpha
  ctx.fillStyle = ink
  ctx.globalAlpha = opacity
  for (const note of clip.notes) {
    const phase = ((note.startBeat % cycle) + cycle) % cycle
    const noteLength = Math.min(note.lengthBeats, cycle)
    const first = Math.floor((visibleStart - phase - noteLength) / cycle) + 1
    const last = Math.ceil((visibleEnd - phase) / cycle)
    const y = top + 1 + ((maxPitch - note.pitch) / pitchSpan) * Math.max(0, height - 4)
    for (let repeat = first; repeat < last; repeat++) {
      const start = Math.max(sourceStart, phase + repeat * cycle)
      const end = Math.min(sourceStart + sourceLength, phase + repeat * cycle + noteLength)
      if (end <= start) continue
      const x = Math.max(0, left, left + ((start - sourceStart) / sourceLength) * width)
      const through = Math.min(
        viewportWidth,
        left + width,
        left + ((end - sourceStart) / sourceLength) * width
      )
      if (through > x) ctx.fillRect(x, y, through - x, Math.min(3, height))
    }
  }
  ctx.globalAlpha = opacity
}

export function paintPatternNotes(
  ctx: CanvasRenderingContext2D,
  clip: PatternClip,
  left: number,
  top: number,
  width: number,
  height: number,
  ink: string,
  viewportWidth: number
): void {
  const steps = clip.steps
  if (!steps?.length || height <= 0) return
  const source = patternWindow(clip)
  const cellWidth = width / (clip.lengthBars * PATTERN_STEPS_PER_BAR)
  const opacity = ctx.globalAlpha
  const noteY = Math.round(top + Math.max(0, (height - 3) / 2))
  ctx.fillStyle = ink
  ctx.globalAlpha = opacity
  if (cellWidth < 1) {
    for (let x = Math.ceil(Math.max(0, left)); x < Math.min(viewportWidth, left + width); x++) {
      const from = source.origin + (x - left) / cellWidth
      const end = source.origin + (Math.min(x + 1, left + width) - left) / cellWidth
      if (patternHasActivity(steps, from, end)) ctx.fillRect(x, noteY, 1, Math.min(3, height))
    }
  } else {
    const first = Math.max(source.first, Math.floor(source.origin + Math.max(0, -left) / cellWidth))
    const end = Math.min(
      source.end,
      Math.ceil(source.origin + Math.min(width, viewportWidth - left) / cellWidth)
    )
    for (let i = first; i < end; i++) {
      if (!steps[((i % steps.length) + steps.length) % steps.length]) continue
      const x = Math.max(0, left, left + (i - source.origin) * cellWidth)
      const through = Math.min(
        viewportWidth,
        left + width,
        left + (i + 1 - source.origin) * cellWidth
      )
      if (through > x)
        ctx.fillRect(
          x,
          noteY,
          Math.max(1, Math.min(cellWidth - 1, through - x)),
          Math.min(3, height)
        )
    }
  }
  ctx.globalAlpha = opacity
}
