import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { ArrowLeft, ArrowRight, Maximize2, Minus, Plus } from "lucide-react"
import type { SourceViewport } from "../useSourceViewport"
import type { WaveformData } from "./useWaveformData"

export function WaveformToolbar({
  waveform: { sourceName, realSource },
  viewport: { view, minimum, rangeSpan, pan, zoom, fit },
}: {
  waveform: Pick<WaveformData, "sourceName" | "realSource">
  viewport: Pick<SourceViewport, "view" | "minimum" | "rangeSpan" | "pan" | "zoom" | "fit">
}) {
  const { t } = useTranslation()
  const name = sourceName || t("detailAudio.emptySource")
  return (
    <div className="audio-detail-filebar">
      <span className="audio-detail-file" title={name}>
        {name}
      </span>
      {!realSource && (
        <span className="audio-detail-envelope-label">{t("detailAudio.monoEnvelope")}</span>
      )}
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
        <Button size="control-icon" variant="ghost" aria-label={t("detailAudio.fit")} onClick={fit}>
          <Maximize2 />
        </Button>
      </span>
    </div>
  )
}
