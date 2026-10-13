import { useEffect, useRef } from "react"
import { arrangementRingBuffer } from "./audio/ring-buffer"
import { readThemeStamp, readTokens } from "./tokens"
import { createMeterPaintState, paintMeter } from "./painters/meter"
import { arrangementScheduler } from "./scheduler"

export function TrackMeter({ trackId, className }: { trackId: string; className?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const containerEl = container.current
    const canvasEl = canvas.current
    if (!containerEl || !canvasEl) return
    const ctx = canvasEl.getContext("2d")
    if (!ctx) return

    const PAINTER_ID = `track-meter:${trackId}`
    let lastRevision = -1
    const meterState = createMeterPaintState()
    let peaksActive = false
    let geometry = { width: 0, height: 0, dpr: 1 }
    let tokens = readTokens(containerEl)
    let themeStamp = readThemeStamp()

    function resize() {
      if (!containerEl || !canvasEl) return
      const rect = containerEl.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (geometry.width === rect.width && geometry.height === rect.height && geometry.dpr === dpr)
        return
      const width = Math.round(rect.width * dpr)
      const height = Math.round(rect.height * dpr)
      canvasEl.style.width = `${rect.width}px`
      canvasEl.style.height = `${rect.height}px`
      if (canvasEl.width !== width) canvasEl.width = width
      if (canvasEl.height !== height) canvasEl.height = height
      geometry = { width: rect.width, height: rect.height, dpr }
      lastRevision = -1
      paint()
    }

    function paint() {
      if (!ctx) return
      const revision = arrangementRingBuffer.readRevision()
      if (revision === lastRevision && !peaksActive) {
        arrangementScheduler.invalidate(PAINTER_ID)
        return
      }
      lastRevision = revision
      peaksActive = paintMeter(
        ctx,
        trackId,
        arrangementRingBuffer,
        {
          background: tokens["--muted"],
          good: tokens["--arrangement-meter-good"],
          warn: tokens["--arrangement-meter-warn"],
          danger: tokens["--arrangement-meter-danger"],
          line: tokens["--arrangement-ruler"],
          peak: tokens["--muted-foreground"],
        },
        geometry,
        meterState,
        performance.now()
      )
      arrangementScheduler.invalidate(PAINTER_ID)
    }

    const detach = arrangementScheduler.register(PAINTER_ID, paint)
    const observer = new ResizeObserver(resize)
    observer.observe(containerEl)
    resize()
    const theme = new MutationObserver(() => {
      const next = readThemeStamp()
      if (next === themeStamp) return
      themeStamp = next
      tokens = readTokens(containerEl)
      lastRevision = -1
      arrangementScheduler.invalidate(PAINTER_ID)
    })
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    })

    return () => {
      detach()
      observer.disconnect()
      theme.disconnect()
      arrangementRingBuffer.freeMeter(trackId)
    }
  }, [trackId])

  return (
    <div
      ref={container}
      className={className}
      style={{ width: "var(--spacing-control-track)", height: "100%", minHeight: 0, flexShrink: 0 }}
    >
      <canvas ref={canvas} className="block h-full w-full" />
    </div>
  )
}
