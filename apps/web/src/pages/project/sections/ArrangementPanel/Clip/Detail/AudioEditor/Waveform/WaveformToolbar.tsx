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
    <div className="h-control-h gap-control-gap flex min-w-0 shrink-0 items-center">
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
      {!realSource && (
        <span className="text-muted-foreground shrink-0 whitespace-nowrap">
          {t("detailAudio.monoEnvelope")}
        </span>
      )}
      <span className="gap-control-gap ml-auto flex shrink-0">
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
