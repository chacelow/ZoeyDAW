import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { ArrowLeft, ArrowRight, Maximize2, Minus, Plus } from "lucide-react"
import { formatAudioMusicalValue, getAudioClipSettings } from "@/pages/project/model/audio-editor"
import { DEFAULT_FADE_CURVE, fadeControls, fadePath } from "@/pages/project/model/fades"
import { timeTickLabel } from "@/pages/project/model/timeline-ticks"
import { SourceMarker } from "../SourceMarker"
import { useSourceViewport } from "../useSourceViewport"
import type { AudioClip, DocumentState } from "@/pages/project/model/types"

export function AudioWaveform({
  clip,
  transport,
}: {
  readonly clip: AudioClip
  readonly transport: DocumentState["transport"]
}) {
  const { t } = useTranslation()
  const settings = getAudioClipSettings(clip, transport.bpm)
  const { view, setView, zoom, pan, fit, minimum, extent, rangeSpan } = useSourceViewport(
    clip,
    settings
  )
  const [selection, setSelection] = useState<number | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const panDrag = useRef<{ x: number; start: number; scale: number } | null>(null)
  const overviewDrag = useRef<{ x: number; start: number; scale: number } | null>(null)
  useLayoutEffect(() => {
    const node = surface.current
    if (!node) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const node = surface.current
    if (!node) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const rect = node.getBoundingClientRect()
        zoom(
          Math.exp(-event.deltaY * 0.005),
          Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
        )
      } else if (event.shiftKey || Math.abs(event.deltaX) > 0) {
        event.preventDefault()
        pan(((event.deltaX || event.deltaY) / Math.max(1, width)) * view.span)
      }
    }
    node.addEventListener("wheel", wheel, { passive: false })
    return () => node.removeEventListener("wheel", wheel)
  }, [pan, zoom, view.span, width])
  const start = clip.sourceOffsetBars ?? 0
  const inFade = fadeControls(clip, "in")
  const outFade = fadeControls(clip, "out")
  const peaks = clip.waveformPeaks
  const hasPeaks = !!peaks?.length
  const gain = 10 ** (clip.gainDb / 20)
  const secondsPerBar =
    ((60 / settings.sourceBpm) * transport.numerator * 4) / transport.denominator
  const tickStep =
    2 ** Math.ceil(Math.log2(Math.max((view.span * 72) / Math.max(1, width), 1 / 64)))
  const firstTick = Math.ceil(view.start / tickStep) * tickStep
  const ticks = Array.from(
    { length: Math.min(100, Math.ceil(view.span / tickStep) + 1) },
    (_, index) => firstTick + index * tickStep
  ).filter(value => value <= view.start + view.span)
  const markerProps = {
    clip,
    bpm: transport.bpm,
    numerator: transport.numerator,
    denominator: transport.denominator,
    viewStart: view.start,
    viewSpan: view.span,
    help: t("detailAudio.markerHelp"),
  }
  const overviewSpan = Math.max(1 / 16_384, extent - minimum)
  return (
    <section className="audio-detail-waveform" aria-label={t("detailAudio.waveform")}>
      <div className="audio-detail-filebar">
        <span className="audio-detail-file" title={clip.samplePath || t("detailAudio.emptySource")}>
          {clip.samplePath ? clip.samplePath.split(/[\\/]/).pop() : t("detailAudio.emptySource")}
        </span>
        <span className="audio-detail-envelope-label">{t("detailAudio.monoEnvelope")}</span>
        <span className="audio-detail-zoom-actions">
          <Button
            size="control-icon"
            variant="ghost"
            aria-label={t("detailAudio.panLeft")}
            disabled={view.start <= minimum}
            onClick={() => pan(-view.span / 4)}
          >
            <ArrowLeft />
          </Button>
          <Button
            size="control-icon"
            variant="ghost"
            aria-label={t("detailAudio.panRight")}
            onClick={() => pan(view.span / 4)}
          >
            <ArrowRight />
          </Button>
          <Button
            size="control-icon"
            variant="ghost"
            aria-label={t("detailAudio.zoomOut")}
            disabled={view.span >= Math.max(1, rangeSpan * 4)}
            onClick={() => zoom(0.5)}
          >
            <Minus />
          </Button>
          <Button
            size="control-icon"
            variant="ghost"
            aria-label={t("detailAudio.zoomIn")}
            disabled={view.span <= 1 / 16_384}
            onClick={() => zoom(2)}
          >
            <Plus />
          </Button>
          <Button
            size="control-icon"
            variant="ghost"
            aria-label={t("detailAudio.fit")}
            onClick={fit}
          >
            <Maximize2 />
          </Button>
        </span>
      </div>
      <div
        ref={surface}
        className="audio-detail-source-surface"
        title={t("detailAudio.previewHelp")}
        onPointerDown={event => {
          if (event.button === 1 || (event.button === 0 && event.altKey)) {
            event.preventDefault()
            panDrag.current = {
              x: event.clientX,
              start: view.start,
              scale: view.span / Math.max(1, width),
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          } else if (event.button === 0) {
            const rect = event.currentTarget.getBoundingClientRect()
            setSelection(view.start + ((event.clientX - rect.left) / rect.width) * view.span)
          }
        }}
        onPointerMove={event => {
          const drag = panDrag.current
          if (drag)
            setView(previous => ({
              ...previous,
              start: Math.max(minimum, drag.start - (event.clientX - drag.x) * drag.scale),
            }))
        }}
        onPointerUp={event => {
          panDrag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          panDrag.current = null
        }}
        onLostPointerCapture={() => {
          panDrag.current = null
        }}
      >
        <div role="group" className="audio-detail-ruler" aria-label={t("detailAudio.musicalRuler")}>
          {ticks.map(value => (
            <span key={value} style={{ left: `${((value - view.start) / view.span) * 100}%` }}>
              {formatAudioMusicalValue(
                value,
                transport.numerator,
                transport.denominator,
                "position"
              )}
            </span>
          ))}
        </div>
        <div className="audio-detail-loop-strip" data-loop={settings.loop}>
          <div
            className="audio-detail-loop-range"
            style={{
              left: `${((settings.loopStartBars - view.start) / view.span) * 100}%`,
              width: `${(settings.loopLengthBars / view.span) * 100}%`,
            }}
            title={t(settings.loop ? "detailAudio.loopWindow" : "detailAudio.loopWindowOff")}
          />
          <SourceMarker
            {...markerProps}
            kind="loopStart"
            position={settings.loopStartBars}
            label={t("detailAudio.loopStart")}
          />
          <SourceMarker
            {...markerProps}
            kind="loopEnd"
            position={settings.loopStartBars + settings.loopLengthBars}
            label={t("detailAudio.loopEnd")}
          />
        </div>
        <div className="audio-detail-wave-area">
          <svg
            className="audio-detail-wave-svg"
            viewBox={`${view.start} 0 ${view.span} 100`}
            preserveAspectRatio="none"
            aria-hidden
          >
            {ticks.map(value => (
              <line
                className="audio-detail-grid"
                key={value}
                x1={value}
                x2={value}
                y1={0}
                y2={100}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              className="audio-detail-center"
              x1={view.start}
              x2={view.start + view.span}
              y1={50}
              y2={50}
              vectorEffect="non-scaling-stroke"
            />
            {peaks?.map((_, index) => {
              const amplitude = Math.max(
                0,
                Math.min(
                  1,
                  (peaks[settings.reverse ? peaks.length - 1 - index : index] ?? 0) * gain
                )
              )
              return (
                <rect
                  className="audio-detail-peak"
                  key={index}
                  x={start + (index / peaks.length) * clip.lengthBars}
                  y={50 - amplitude * 46}
                  width={(clip.lengthBars / peaks.length) * 0.82}
                  height={amplitude * 92}
                />
              )
            })}
            <g transform={`translate(${start} 0)`} className="audio-detail-fade">
              {(clip.fadeInBars ?? 0) > 0 && (
                <path
                  d={fadePath(
                    "in",
                    inFade.start,
                    clip.fadeInBars ?? 0,
                    clip.fadeInCurve ?? DEFAULT_FADE_CURVE,
                    clip.fadeInCurvePosition
                  )}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {(clip.fadeOutBars ?? 0) > 0 && (
                <path
                  d={fadePath(
                    "out",
                    outFade.start,
                    clip.fadeOutBars ?? 0,
                    clip.fadeOutCurve ?? DEFAULT_FADE_CURVE,
                    clip.fadeOutCurvePosition
                  )}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
            {selection !== null && (
              <line
                className="audio-detail-selection"
                x1={selection}
                x2={selection}
                y1={0}
                y2={100}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {!hasPeaks && (
            <div className="audio-detail-empty">
              {t(clip.samplePath ? "detailAudio.unknownWaveform" : "detailAudio.emptySource")}
            </div>
          )}
          <SourceMarker
            {...markerProps}
            kind="start"
            position={settings.startMarkerBars}
            label={t("detailAudio.sourceStart")}
          />
          <SourceMarker
            {...markerProps}
            kind="end"
            position={settings.endMarkerBars}
            label={t("detailAudio.sourceEnd")}
          />
          <SourceMarker
            {...markerProps}
            kind="fadeIn"
            lower
            position={start + inFade.end}
            label={t("detailAudio.fadeInMarker")}
          />
          <SourceMarker
            {...markerProps}
            kind="fadeOut"
            lower
            position={start + outFade.start}
            label={t("detailAudio.fadeOutMarker")}
          />
        </div>
        <div
          role="group"
          className="audio-detail-ruler audio-detail-time-ruler"
          aria-label={t("detailAudio.timeRuler")}
        >
          {ticks.map(value => (
            <span key={value} style={{ left: `${((value - view.start) / view.span) * 100}%` }}>
              {timeTickLabel(value * secondsPerBar)}
            </span>
          ))}
        </div>
      </div>
      <div
        className="audio-detail-overview"
        role="slider"
        tabIndex={0}
        aria-label={t("detailAudio.overview")}
        aria-valuemin={minimum}
        aria-valuemax={extent}
        aria-valuenow={view.start}
        onDoubleClick={fit}
        onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          pan((view.span / 4) * (event.key === "ArrowLeft" ? -1 : 1))
        }}
        onPointerDown={event => {
          if (event.button !== 0) return
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          const scale = overviewSpan / Math.max(1, rect.width)
          const clicked = minimum + (event.clientX - rect.left) * scale
          const nextStart =
            clicked >= view.start && clicked <= view.start + view.span
              ? view.start
              : Math.max(minimum, Math.min(extent - view.span, clicked - view.span / 2))
          setView(previous => ({ ...previous, start: nextStart }))
          overviewDrag.current = { x: event.clientX, start: nextStart, scale }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const drag = overviewDrag.current
          if (drag)
            setView(previous => ({
              ...previous,
              start: Math.max(
                minimum,
                Math.min(extent - previous.span, drag.start + (event.clientX - drag.x) * drag.scale)
              ),
            }))
        }}
        onPointerUp={event => {
          overviewDrag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          overviewDrag.current = null
        }}
        onLostPointerCapture={() => {
          overviewDrag.current = null
        }}
      >
        <svg viewBox={`${minimum} 0 ${overviewSpan} 100`} preserveAspectRatio="none" aria-hidden>
          {peaks?.map((_, index) => {
            const amplitude = Math.max(
              0,
              Math.min(1, peaks[settings.reverse ? peaks.length - 1 - index : index] ?? 0)
            )
            return (
              <rect
                className="audio-detail-peak"
                key={index}
                x={start + (index / peaks.length) * clip.lengthBars}
                y={50 - amplitude * 45}
                width={clip.lengthBars / peaks.length}
                height={amplitude * 90}
              />
            )
          })}
        </svg>
        <div
          className="audio-detail-overview-frame"
          style={{
            left: `${((view.start - minimum) / overviewSpan) * 100}%`,
            width: `${(view.span / overviewSpan) * 100}%`,
          }}
        />
      </div>
      <div className="audio-detail-preview-status">
        <span>
          {t("detailAudio.zoom")} {(clip.lengthBars / view.span).toFixed(1)}×
        </span>
        <span>
          {t("detailAudio.selection")}:{" "}
          {selection === null ? "—" : timeTickLabel(selection * secondsPerBar)}
        </span>
        <span>{t("detailAudio.prototype")}</span>
      </div>
    </section>
  )
}
