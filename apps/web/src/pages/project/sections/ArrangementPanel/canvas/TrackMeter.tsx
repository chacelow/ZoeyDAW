import { useEffect, useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { usesGhostInputMeter, usesLiveInputMeter } from "../TrackHeader/TrackRouting/input-levels"
import { readThemeStamp, readTokens } from "./tokens"
import { createMeterPaintState, paintMeter } from "./painters/meter"
import { arrangementScheduler } from "./scheduler"
import {
  readProjectMeters,
  readProjectMeterLevels,
  watchProjectMeter,
} from "@/pages/project/adapters/realtime"

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
    let dirty = true
    const meterState = createMeterPaintState()
    let isPeaksActive = false
    let lastGhost: boolean | null = null
    let lastLiveInput: boolean | null = null
    let lastChannel: string | undefined
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
      dirty = true
      paint()
    }

    function paint() {
      if (!context) {
        return
      }
      const project = useProjectState.getState()
      const track = project.document.tracks.find(item => item.id === trackId)
      const ghost = track ? usesGhostInputMeter(track) : false
      const liveInput = track ? usesLiveInputMeter(track, project.session.playing) : false
      const channel = track?.inputChannel
      if (
        !dirty &&
        !isPeaksActive &&
        lastGhost === ghost &&
        lastLiveInput === liveInput &&
        lastChannel === channel
      )
        return
      if (
        ghost !== lastGhost ||
        liveInput !== lastLiveInput ||
        ((ghost || liveInput) && channel !== lastChannel)
      ) {
        meterState.left.db = -60
        meterState.right.db = -60
        meterState.left.holdUntil = 0
        meterState.right.holdUntil = 0
      }
      lastGhost = ghost
      lastLiveInput = liveInput
      lastChannel = channel
      dirty = false
      const started = performance.now()
      isPeaksActive = paintMeter(
        context,
        {
          background: tokens["--muted"],
          good: ghost ? tokens["--muted-foreground"] : tokens["--arrangement-meter-good"],
          warn: ghost ? tokens["--muted-foreground"] : tokens["--arrangement-meter-warn"],
          danger: ghost ? tokens["--muted-foreground"] : tokens["--arrangement-meter-danger"],
          line: tokens["--arrangement-ruler"],
          peak: tokens["--muted-foreground"],
        },
        geometry,
        meterState,
        performance.now(),
        ghost || liveInput
          ? readProjectMeterLevels({ kind: "input", channel: track?.inputChannel ?? "1" })
          : readProjectMeterLevels({ kind: "track", trackId })
      )
      readProjectMeters()?.recordPaint(performance.now() - started)
      if (isPeaksActive) {
        arrangementScheduler.invalidate(PAINTER_ID)
      }
    }

    const detach = arrangementScheduler.register(PAINTER_ID, paint)
    const detachMeters = watchProjectMeter(PAINTER_ID, { kind: "track", trackId }, () => {
      dirty = true
      arrangementScheduler.invalidate(PAINTER_ID)
    })
    let detachInputs = () => {}
    let inputKey = ""
    const updateInputs = () => {
      const track = useProjectState.getState().document.tracks.find(item => item.id === trackId)
      const channel =
        track?.kind === "audio" && track.input === "external" ? (track.inputChannel ?? "1") : ""
      if (channel === inputKey) return
      inputKey = channel
      detachInputs()
      detachInputs = channel
        ? watchProjectMeter(`${PAINTER_ID}:input`, { kind: "input", channel }, () => {
            dirty = true
            arrangementScheduler.invalidate(PAINTER_ID)
          })
        : () => {}
    }
    updateInputs()
    const detachTrack = useProjectState.subscribe((state, previous) => {
      updateInputs()
      if (
        state.document.tracks !== previous.document.tracks ||
        state.session.playing !== previous.session.playing
      )
        arrangementScheduler.invalidate(PAINTER_ID)
    })
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
      dirty = true
      arrangementScheduler.invalidate(PAINTER_ID)
    })
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    })

    return () => {
      detach()
      detachTrack()
      detachMeters()
      detachInputs()
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
