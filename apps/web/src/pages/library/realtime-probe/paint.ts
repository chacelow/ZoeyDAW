import type { PaintProof } from "./model"
import type { ProbeFrame } from "./transport"

export type ProbePainter = {
  paint(frame: ProbeFrame): PaintProof
  stale(): void
  latest(): PaintProof | null
}

export function createProbePainter(canvas: HTMLCanvasElement, caseKey: string): ProbePainter {
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("Probe canvas 2D context is unavailable")
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(canvas.clientWidth))
  const height = Math.max(1, Math.round(canvas.clientHeight))
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  context.scale(ratio, ratio)
  const color = getComputedStyle(canvas).color
  let paintCount = 0
  let lastProof: PaintProof | null = null
  canvas.dataset.probeCase = caseKey
  delete canvas.dataset.probePaintedSeq
  canvas.dataset.probePaintCount = "0"
  return {
    paint(frame: ProbeFrame): PaintProof {
      context.clearRect(0, 0, width, height)
      context.fillStyle = color
      context.fillRect(0, 0, 4, 4)
      const position = Number(frame.seq % 256n) / 255
      context.fillRect(0, 12, Math.max(1, position * width), 12)
      context.font = "12px monospace"
      context.fillText(`${caseKey} / seq ${frame.seq} / ${frame.sampledPayload}`, 8, 44)
      const pixel = context.getImageData(1, 1, 1, 1).data
      paintCount += 1
      lastProof = {
        caseKey,
        seq: frame.seq.toString(),
        paintCount,
        paintedMs: performance.now(),
        sampledPayload: frame.sampledPayload,
        markerPixelRgba: Array.from(pixel),
      }
      canvas.dataset.probePaintedSeq = lastProof.seq
      canvas.dataset.probePaintCount = String(paintCount)
      canvas.dataset.probeState = "running"
      canvas.dispatchEvent(
        new CustomEvent<PaintProof>("realtime-probe-painted", { detail: lastProof })
      )
      return lastProof
    },
    stale() {
      canvas.dataset.probeState = "stale"
      context.clearRect(0, 0, width, height)
    },
    latest() {
      return lastProof
    },
  }
}
