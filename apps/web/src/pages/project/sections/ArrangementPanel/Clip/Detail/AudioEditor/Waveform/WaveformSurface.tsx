import { clipSourceCoordinate, projectTempoSections } from "@zoeydaw/project-core/tempo-map"
import { useTranslation } from "@zoeymind/i18n"
import {
  formatAudioMusicalValue,
  warpSourceBar,
  warpTargetBar,
  type AudioClipSettings,
} from "@zoeydaw/project-core/audio-editor"
import { DEFAULT_FADE_CURVE, fadeControls, fadePath } from "@zoeydaw/project-core/fades"
import { timeTickLabel } from "@zoeydaw/project-core/timeline-ticks"
import type { AudioClipContent, DocumentState } from "@zoeydaw/project-core/types"
import { useProjectState } from "@/pages/project/adapters"
import { SourcePlayhead } from "@/pages/project/components/SourcePlayhead"
import { SourceMarker } from "../SourceMarker"
import type { SourceViewport } from "../useSourceViewport"
import { SignedWaveform } from "./SignedWaveform"
import type { WaveformData } from "./useWaveformData"
import type { WaveformDimensions } from "./useWaveformDimensions"
import type { WaveformPointerHandlers } from "./useWaveformInteraction"

export function WaveformSurface({
  clip,
  transport,
  settings,
  view,
  dimensions: { surface, waveArea, width, waveHeight },
  waveform: { realSource, signedPaths, wavePath, hasPeaks, secondsPerBar },
  selection,
  handlers,
}: {
  clip: AudioClipContent
  transport: DocumentState["transport"]
  settings: AudioClipSettings
  view: SourceViewport["view"]
  dimensions: Pick<WaveformDimensions, "surface" | "waveArea" | "width" | "waveHeight">
  waveform: Pick<
    WaveformData,
    "realSource" | "signedPaths" | "wavePath" | "hasPeaks" | "secondsPerBar"
  >
  selection: number | null
  handlers: WaveformPointerHandlers
}) {
  const { t } = useTranslation()
  const tempoTracks = useProjectState(state => state.document.tracks)
  const timebase = { ...transport, tempo: projectTempoSections(tempoTracks, transport) }
  const inFade = fadeControls(clip, "in")
  const outFade = fadeControls(clip, "out")
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

  return (
    <div
      ref={surface}
      className="audio-detail-source-surface"
      title={t("detailAudio.previewHelp")}
      {...handlers}
    >
      <div role="group" className="audio-detail-ruler" aria-label={t("detailAudio.musicalRuler")}>
        {ticks.map(value => (
          <span key={value} style={{ left: `${((value - view.start) / view.span) * 100}%` }}>
            {formatAudioMusicalValue(value, transport.numerator, transport.denominator, "position")}
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
      {settings.warp && settings.warpMarkers?.length ? (
        <div
          role="group"
          className="h-control-compact border-border relative border-b"
          aria-label={t("detailAudio.warpMarkers")}
        >
          {settings.warpMarkers.map((marker, index) => (
            <span
              key={marker.id}
              className="border-foreground absolute h-full border-l"
              style={{ left: `${((marker.targetBar - view.start) / view.span) * 100}%` }}
              title={`${t("detailAudio.warpMarker")} ${index + 1}`}
              aria-hidden
            />
          ))}
        </div>
      ) : null}
      <div ref={waveArea} className="audio-detail-wave-area">
        <svg
          className="audio-detail-wave-svg"
          viewBox={`0 0 ${Math.max(1, width)} ${waveHeight}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <svg
            width={width}
            height={waveHeight}
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
          </svg>
          {realSource ? (
            <SignedWaveform paths={signedPaths} />
          ) : (
            <svg
              width={width}
              height={waveHeight}
              viewBox={`${view.start} 0 ${view.span} 100`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <path className="audio-detail-peak" d={wavePath} />
            </svg>
          )}
          <svg
            width={width}
            height={waveHeight}
            viewBox={`${view.start} 0 ${view.span} 100`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <g className="audio-detail-fade">
              {(clip.fadeInBars ?? 0) > 0 && (
                <path
                  d={fadePath(
                    "in",
                    clipSourceCoordinate(clip, timebase, inFade.start),
                    clipSourceCoordinate(clip, timebase, inFade.end) -
                      clipSourceCoordinate(clip, timebase, inFade.start),
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
                    clipSourceCoordinate(clip, timebase, outFade.start),
                    clipSourceCoordinate(clip, timebase, outFade.end) -
                      clipSourceCoordinate(clip, timebase, outFade.start),
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
        </svg>
        <SourcePlayhead
          source={
            clip.sourceId === null
              ? null
              : { kind: "arrangement", clipId: clip.id, sourceId: clip.sourceId }
          }
          startSeconds={view.start * secondsPerBar}
          spanSeconds={view.span * secondsPerBar}
          mapSeconds={
            settings.warp && settings.warpMarkers?.length
              ? seconds =>
                  warpTargetBar(settings.warpMarkers ?? [], seconds / secondsPerBar) * secondsPerBar
              : undefined
          }
        />
        {(realSource ? !signedPaths.some(channel => channel.path.length > 0) : !hasPeaks) && (
          <div className="audio-detail-empty">
            {t(clip.sourceId !== null ? "detailAudio.unknownWaveform" : "detailAudio.emptySource")}
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
          position={clipSourceCoordinate(clip, timebase, inFade.end)}
          label={t("detailAudio.fadeInMarker")}
        />
        <SourceMarker
          {...markerProps}
          kind="fadeOut"
          lower
          position={clipSourceCoordinate(clip, timebase, outFade.start)}
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
            {timeTickLabel(
              (settings.warp ? warpSourceBar(settings.warpMarkers ?? [], value) : value) *
                secondsPerBar
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
