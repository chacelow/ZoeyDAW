import { useTranslation } from "@zoeymind/i18n"
import { getAudioClipSettings, warpSourceBar } from "@zoeydaw/project-core/audio-editor"
import { timeTickLabel } from "@zoeydaw/project-core/timeline-ticks"
import type { AudioClipContent, DocumentState } from "@zoeydaw/project-core/types"
import { findMediaSource } from "@zoeydaw/project-core/media"
import { useProjectState } from "@/pages/project/adapters"
import { useSourceViewport } from "../useSourceViewport"
import { SourceOverview } from "./SourceOverview"
import { WaveformSurface } from "./WaveformSurface"
import { WaveformToolbar } from "./WaveformToolbar"
import { useWaveformData } from "./useWaveformData"
import { useWaveformDimensions } from "./useWaveformDimensions"
import { useWaveformInteraction } from "./useWaveformInteraction"

export function AudioWaveform({
  clip,
  transport,
}: {
  readonly clip: AudioClipContent
  readonly transport: DocumentState["transport"]
}) {
  const { t } = useTranslation()
  const settings = getAudioClipSettings(clip, transport.bpm)
  const source = useProjectState(state => findMediaSource(state.document.media, clip.sourceId))
  const viewport = useSourceViewport(
    clip,
    settings,
    transport.bpm,
    transport.numerator,
    transport.denominator,
    source
  )
  const dimensions = useWaveformDimensions()
  const waveform = useWaveformData({ clip, transport, settings, viewport, dimensions })
  const { selection, surfaceHandlers, overviewHandlers } = useWaveformInteraction(
    viewport,
    dimensions
  )

  return (
    <section
      className="gap-control-gap p-control-gap flex min-h-[var(--spacing-control-h)] min-w-0 flex-1 flex-col overflow-hidden"
      aria-label={t("detailAudio.waveform")}
    >
      <WaveformToolbar waveform={waveform} viewport={viewport} />
      <WaveformSurface
        clip={clip}
        transport={transport}
        settings={settings}
        view={viewport.view}
        dimensions={dimensions}
        waveform={waveform}
        selection={selection}
        handlers={surfaceHandlers}
      />
      <SourceOverview
        viewport={viewport}
        dimensions={dimensions}
        waveform={waveform}
        handlers={overviewHandlers}
      />
      <div className="text-muted-foreground gap-control-gap flex flex-wrap text-[length:var(--text-control)]">
        <span>
          {t("detailAudio.zoom")} {(viewport.rangeSpan / viewport.view.span).toFixed(1)}×
        </span>
        <span className="ml-auto">
          {t("detailAudio.selection")}:{" "}
          {selection === null
            ? "—"
            : timeTickLabel(
                (settings.warp ? warpSourceBar(settings.warpMarkers ?? [], selection) : selection) *
                  waveform.secondsPerBar
              )}
        </span>
        {!waveform.realSource && <span>{t("detailAudio.prototype")}</span>}
      </div>
    </section>
  )
}
