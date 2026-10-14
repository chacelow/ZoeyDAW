import { useEffect, useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { arrangementRingBuffer } from "./audio/ring-buffer"
import { readThemeStamp, readTokens } from "./tokens"
import { createMeterPaintState, paintMeter } from "./painters/meter"
import { arrangementScheduler } from "./scheduler"

export function TrackMeter({
  trackId,
  trackName,
  className,
}: {
  readonly trackId: string
  readonly trackName: string
  readonly className?: string
}) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const epoch = useProjectState(state => state.session.backend.sessionId)

  useEffect(() => {
    const containerElement = container.current
    const canvasElement = canvas.current
    if (!containerElement || !canvasElement) {
      return
    }
    const context = canvasElement.getContext("2d")
    if (!context) {
      return
    }

    const PAINTER_ID = `track-meter:${trackId}`
    let lastRevision = -1
    const meterState = createMeterPaintState()
    let isPeaksActive = false
    let geometry = { width: 0, height: 0, dpr: 1 }
    let tokens = readTokens(containerElement)
    let themeStamp = readThemeStamp()

    function resize() {
      if (!containerElement || !canvasElement) {
        return
      }
      const rect = containerElement.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (
        geometry.width === rect.width &&
        geometry.height === rect.height &&
        geometry.dpr === dpr
      ) {
        return
      }
      const width = Math.round(rect.width * dpr)
      const height = Math.round(rect.height * dpr)
      canvasElement.style.width = `${rect.width}px`
      canvasElement.style.height = `${rect.height}px`
      if (canvasElement.width !== width) {
        canvasElement.width = width
      }
      if (canvasElement.height !== height) {
        canvasElement.height = height
      }
      geometry = { width: rect.width, height: rect.height, dpr }
      lastRevision = -1
      paint()
    }

    function paint() {
      if (!context) {
        return
      }
      const revision = arrangementRingBuffer.readRevision()
      if (revision === lastRevision && !isPeaksActive) {
        return
      }
      lastRevision = revision
      isPeaksActive = paintMeter(
        context,
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
      if (isPeaksActive) {
        arrangementScheduler.invalidate(PAINTER_ID)
      }
    }

    const detach = arrangementScheduler.register(PAINTER_ID, paint)
    const observer = new ResizeObserver(resize)
    observer.observe(containerElement)
    resize()
    const theme = new MutationObserver(() => {
      const next = readThemeStamp()
      if (next === themeStamp) {
        return
      }
      themeStamp = next
      tokens = readTokens(containerElement)
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
    }
  }, [trackId, epoch])

  return (
    <div
      ref={container}
      className={className}
      style={{ width: "var(--spacing-control-track)", height: "100%", minHeight: 0, flexShrink: 0 }}
    >
      <canvas
        ref={canvas}
        aria-label={`${t("arrangement.levelMeter")} ${trackName}`}
        className="block h-full w-full"
      />
    </div>
  )
}
