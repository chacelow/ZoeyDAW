import { useTranslation } from "@zoeymind/i18n"
import { getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { timeTickLabel } from "@zoeydaw/project-core/timeline-ticks"
import type { AudioClip, DocumentState } from "@zoeydaw/project-core/types"
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
  readonly clip: AudioClip
  readonly transport: DocumentState["transport"]
}) {
  const { t } = useTranslation()
  const settings = getAudioClipSettings(clip, transport.bpm)
  const viewport = useSourceViewport(clip, settings)
  const dimensions = useWaveformDimensions()
  const waveform = useWaveformData({ clip, transport, settings, viewport, dimensions })
  const { selection, surfaceHandlers, overviewHandlers } = useWaveformInteraction(
    viewport,
    dimensions
  )

  return (
    <section className="audio-detail-waveform" aria-label={t("detailAudio.waveform")}>
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
      <div className="audio-detail-preview-status">
        <span>
          {t("detailAudio.zoom")} {(clip.lengthBars / viewport.view.span).toFixed(1)}×
        </span>
        <span>
          {t("detailAudio.selection")}:{" "}
          {selection === null ? "—" : timeTickLabel(selection * waveform.secondsPerBar)}
        </span>
        <span>{t("detailAudio.prototype")}</span>
      </div>
    </section>
  )
}
