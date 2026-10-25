import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import type {
  AudioClip,
  Clip,
  MidiClip,
  MidiPattern,
  DocumentState,
} from "@zoeydaw/project-core/types"
import { findMediaSource } from "@zoeydaw/project-core/media"
import type { MediaSource } from "@zoeydaw/project-core/media"
import { nativeClipWaveform } from "@/pages/project/adapters/backend/clip-waveform"
import { samplePeakColumns } from "@zoeydaw/project-core/waveform"
import { cachedWaveformRanges } from "@/pages/project/adapters/backend/waveform-ranges"
import { signedWaveformPreviewPaths } from "@zoeydaw/project-core/signed-waveform"
import type { WaveformRange } from "@zoeydaw/project-core/waveform-range"

const waveformBitmaps = new Map<string, OffscreenCanvas | HTMLCanvasElement>()
const waveformRangeIds = new WeakMap<object, number>()
const waveformIdentity = { next: 0 }

function rangeId(range: object): number {
  let id = waveformRangeIds.get(range)
  if (id === undefined) {
    id = ++waveformIdentity.next
    waveformRangeIds.set(range, id)
  }
  return id
}

function createBitmap(width: number, height: number): OffscreenCanvas | HTMLCanvasElement | null {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height)
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  return canvas
}

function rememberBitmap(key: string, bitmap: OffscreenCanvas | HTMLCanvasElement): void {
  if (waveformBitmaps.size >= 24) {
    const oldest = waveformBitmaps.keys().next()
    if (!oldest.done) waveformBitmaps.delete(oldest.value)
  }
  waveformBitmaps.set(key, bitmap)
}

function clipLoopBars(
  clip: Clip,
  media: readonly MediaSource[],
  patterns: readonly MidiPattern[]
): number | null {
  if (clip.kind !== "audio") {
    const midi = resolveMidiClip(clip, patterns)
    return midi.loopBars ?? midi.lengthBars
  }
  const source = findMediaSource(media, clip.sourceId)
  if (source?.location.kind !== "fixture") return null
  if (source.location.uri === "mock://kick.wav") return 16
  return source.location.uri === "mock://untitled.wav" ? 1 : null
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
  ink: string,
  media: readonly MediaSource[],
  patterns: readonly MidiPattern[]
): void {
  const period = clipLoopBars(clip, media, patterns)
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
  viewportWidth: number,
  media: readonly MediaSource[],
  transport: Pick<DocumentState["transport"], "bpm" | "numerator" | "denominator">,
  suppliedRanges?: readonly WaveformRange[]
): void {
  if (height <= 0 || width <= 0) return
  const envelope = nativeClipWaveform(
    clip,
    media,
    transport.bpm,
    transport.numerator,
    transport.denominator
  )
  if (!envelope) return
  const source = findMediaSource(media, clip.sourceId)
  if (source && source.location.kind !== "fixture") {
    const visibleStart = Math.max(0, -left)
    const visibleEnd = Math.min(width, viewportWidth - left)
    if (visibleEnd <= visibleStart) return
    const ranges = suppliedRanges ?? cachedWaveformRanges(source).map(range => range.data)
    const sliceStart = Math.floor(visibleStart)
    const sliceEnd = Math.ceil(visibleEnd)
    const drawnWidth = Math.max(1, sliceEnd - sliceStart)
    const drawnHeight = Math.max(1, Math.round(height))
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
    const key = [
      source.id,
      source.sha256,
      clip.id,
      envelope.origin,
      envelope.rate,
      envelope.reverse,
      envelope.gain,
      JSON.stringify(envelope.fades),
      JSON.stringify(envelope.loop),
      JSON.stringify(envelope.window),
      clip.lengthBars,
      drawnHeight,
      width,
      sliceStart,
      drawnWidth,
      ink,
      dpr,
      ranges.map(rangeId).join(","),
    ].join("/")
    let bitmap = waveformBitmaps.get(key)
    if (!bitmap) {
      bitmap = createBitmap(Math.ceil(drawnWidth * dpr), Math.ceil(drawnHeight * dpr)) ?? undefined
      const painter = bitmap?.getContext("2d")
      if (bitmap && painter && "fill" in painter) {
        painter.scale(dpr, dpr)
        const slices = signedWaveformPreviewPaths(
          envelope,
          ranges,
          source.frames,
          envelope.origin + (sliceStart / width) * clip.lengthBars * envelope.rate,
          envelope.origin + (sliceEnd / width) * clip.lengthBars * envelope.rate,
          drawnWidth,
          drawnHeight
        )
        painter.fillStyle = ink
        for (const slice of slices) {
          painter.save()
          painter.translate(slice.left, 0)
          painter.scale(slice.scaleX, 1)
          for (const path of slice.paths) {
            Reflect.apply(painter.fill, painter, [new Path2D(path.path)])
            if (path.markers) Reflect.apply(painter.fill, painter, [new Path2D(path.markers)])
          }
          painter.restore()
        }
        rememberBitmap(key, bitmap)
      }
    }
    if (bitmap) {
      context.drawImage(bitmap, left + sliceStart, top, drawnWidth, drawnHeight)
    }
    return
  }
  const { start, values } = samplePeakColumns(
    envelope,
    envelope.origin,
    envelope.origin + clip.lengthBars * envelope.rate,
    width,
    Math.max(0, -left),
    Math.min(width, viewportWidth - left)
  )
  if (!values.length) return
  const mid = top + height / 2
  const amplitude = Math.max(0, height / 2 - 1)
  context.fillStyle = ink
  context.beginPath()
  context.moveTo(left + start, mid - values[0] * amplitude)
  for (let index = 0; index < values.length; index++) {
    const extent = values[index] * amplitude
    context.lineTo(left + start + index, mid - extent)
    context.lineTo(left + Math.min(start + index + 1, width), mid - extent)
  }
  for (let index = values.length - 1; index >= 0; index--) {
    const extent = values[index] * amplitude
    context.lineTo(left + Math.min(start + index + 1, width), mid + extent)
    context.lineTo(left + start + index, mid + extent)
  }
  context.closePath()
  context.fill()
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
    const y =
      top +
      Math.min(1, Math.max(0, height - 3)) +
      ((maxPitch - note.pitch) / pitchSpan) * Math.max(0, height - 4)
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
