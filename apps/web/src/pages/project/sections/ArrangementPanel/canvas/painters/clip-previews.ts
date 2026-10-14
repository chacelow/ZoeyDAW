import { PATTERN_STEPS_PER_BAR } from "@/pages/project/model/types"
import { patternHasActivity, patternWindow } from "@/pages/project/model/pattern-window"
import type { AudioClip, Clip, MidiClip, PatternClip } from "@/pages/project/model/types"

function clipLoopBars(clip: Clip): number | null {
  if (clip.kind === "midi") {
    return clip.loopBars ?? clip.lengthBars
  }
  if (clip.kind === "pattern") {
    return (clip.steps?.length || PATTERN_STEPS_PER_BAR) / PATTERN_STEPS_PER_BAR
  }
  if (clip.samplePath === "mock://kick.wav") {
    return 16
  }
  return clip.samplePath === "mock://untitled.wav" ? 1 : null
}

/**
Mark source-cycle boundaries, irrespective of the current trim or scroll position.
*/
export function paintClipLoopTicks(
  context: CanvasRenderingContext2D,
  clip: Clip,
  left: number,
  top: number,
  width: number,
  viewportWidth: number,
  ink: string
): void {
  const period = clipLoopBars(clip)
  if (!period || width <= 0 || (period / clip.lengthBars) * width < 2) {
    return
  }
  const sourceStart = clip.sourceOffsetBars ?? 0
  const from = sourceStart + (Math.max(0, -left) / width) * clip.lengthBars
  const through = sourceStart + (Math.min(width, viewportWidth - left) / width) * clip.lengthBars
  if (through <= from) {
    return
  }
  const opacity = context.globalAlpha
  context.fillStyle = ink
  context.globalAlpha = opacity * 0.85
  for (let cycle = Math.floor(from / period) + 1; cycle * period < through; cycle++) {
    const x = left + ((cycle * period - sourceStart) / clip.lengthBars) * width
    if (x > left + 1 && x < left + width - 1) {
      context.fillRect(Math.round(x), top, 1, 5)
    }
  }
  context.globalAlpha = opacity
}

export function paintWaveform(
  context: CanvasRenderingContext2D,
  clip: AudioClip,
  left: number,
  top: number,
  width: number,
  height: number,
  ink: string,
  viewportWidth: number
): void {
  const peaks = clip.waveformPeaks
  if (!peaks?.length || height <= 0) {
    return
  }
  const start = Math.max(0, Math.ceil(-left))
  const end = Math.min(Math.ceil(width), Math.ceil(viewportWidth - left))
  if (end <= start) {
    return
  }
  const mid = top + height / 2
  const amplitude = Math.max(0, height / 2 - 1)
  const opacity = context.globalAlpha
  context.strokeStyle = ink
  context.globalAlpha = opacity
  context.beginPath()
  for (let index_ = start; index_ < end; index_++) {
    const index = Math.min(peaks.length - 1, Math.floor((index_ / width) * peaks.length))
    const extent = Math.min(1, Math.abs(peaks[index])) * amplitude
    const x = left + index_ + 0.5
    context.moveTo(x, mid - extent)
    context.lineTo(x, mid + extent)
  }
  context.stroke()
  context.globalAlpha = opacity
}

export function paintMidiNotes(
  context: CanvasRenderingContext2D,
  clip: MidiClip,
  left: number,
  top: number,
  width: number,
  height: number,
  ink: string,
  numerator: number,
  viewportWidth: number
): void {
  if (!clip.notes.length || height <= 0 || width <= 0) {
    return
  }
  const sourceStart = (clip.sourceOffsetBars ?? 0) * numerator
  const sourceLength = clip.lengthBars * numerator
  const cycle = (clip.loopBars ?? clip.lengthBars) * numerator
  const visibleStart = sourceStart + (Math.max(0, -left) / width) * sourceLength
  const visibleEnd = sourceStart + (Math.min(width, viewportWidth - left) / width) * sourceLength
  if (visibleEnd <= visibleStart) {
    return
  }
  let minPitch = Infinity
  let maxPitch = -Infinity
  for (const note of clip.notes) {
    minPitch = Math.min(minPitch, note.pitch)
    maxPitch = Math.max(maxPitch, note.pitch)
  }
  const pitchSpan = Math.max(1, maxPitch - minPitch)
  const opacity = context.globalAlpha
  context.fillStyle = ink
  context.globalAlpha = opacity
  for (const note of clip.notes) {
    const phase = ((note.startBeat % cycle) + cycle) % cycle
    const noteLength = Math.min(note.lengthBeats, cycle)
    const first = Math.floor((visibleStart - phase - noteLength) / cycle) + 1
    const last = Math.ceil((visibleEnd - phase) / cycle)
    const y = top + 1 + ((maxPitch - note.pitch) / pitchSpan) * Math.max(0, height - 4)
    for (let repeat = first; repeat < last; repeat++) {
      const start = Math.max(sourceStart, phase + repeat * cycle)
      const end = Math.min(sourceStart + sourceLength, phase + repeat * cycle + noteLength)
      if (end <= start) {
        continue
      }
      const x = Math.max(0, left, left + ((start - sourceStart) / sourceLength) * width)
      const through = Math.min(
        viewportWidth,
        left + width,
        left + ((end - sourceStart) / sourceLength) * width
      )
      if (through > x) {
        context.fillRect(x, y, through - x, Math.min(3, height))
      }
    }
  }
  context.globalAlpha = opacity
}

export function paintPatternNotes(
  context: CanvasRenderingContext2D,
  clip: PatternClip,
  left: number,
  top: number,
  width: number,
  height: number,
  ink: string,
  viewportWidth: number
): void {
  const { steps } = clip
  if (!steps?.length || height <= 0) {
    return
  }
  const source = patternWindow(clip)
  const cellWidth = width / (clip.lengthBars * PATTERN_STEPS_PER_BAR)
  const opacity = context.globalAlpha
  const noteY = Math.round(top + Math.max(0, (height - 3) / 2))
  context.fillStyle = ink
  context.globalAlpha = opacity
  if (cellWidth < 1) {
    for (let x = Math.ceil(Math.max(0, left)); x < Math.min(viewportWidth, left + width); x++) {
      const from = source.origin + (x - left) / cellWidth
      const end = source.origin + (Math.min(x + 1, left + width) - left) / cellWidth
      if (patternHasActivity(steps, from, end)) {
        context.fillRect(x, noteY, 1, Math.min(3, height))
      }
    }
  } else {
    const first = Math.max(source.first, Math.floor(source.origin + Math.max(0, -left) / cellWidth))
    const end = Math.min(
      source.end,
      Math.ceil(source.origin + Math.min(width, viewportWidth - left) / cellWidth)
    )
    for (let index = first; index < end; index++) {
      if (steps[((index % steps.length) + steps.length) % steps.length] !== true) {
        continue
      }
      const x = Math.max(0, left, left + (index - source.origin) * cellWidth)
      const through = Math.min(
        viewportWidth,
        left + width,
        left + (index + 1 - source.origin) * cellWidth
      )
      if (through > x) {
        context.fillRect(
          x,
          noteY,
          Math.max(1, Math.min(cellWidth - 1, through - x)),
          Math.min(3, height)
        )
      }
    }
  }
  context.globalAlpha = opacity
}
