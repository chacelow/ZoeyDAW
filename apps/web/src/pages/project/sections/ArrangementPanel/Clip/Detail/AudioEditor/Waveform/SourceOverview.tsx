import { useTranslation } from "@zoeymind/i18n"
import type { SourceViewport } from "../useSourceViewport"
import { SignedWaveform } from "./SignedWaveform"
import type { WaveformData } from "./useWaveformData"
import type { WaveformDimensions } from "./useWaveformDimensions"
import type { OverviewHandlers } from "./useWaveformInteraction"

export function SourceOverview({
  viewport: { view, minimum, extent },
  dimensions: { overviewArea, width, overviewHeight },
  waveform: { realSource, overviewSpan, overviewSignedPaths, overviewPath },
  handlers,
}: {
  viewport: Pick<SourceViewport, "view" | "minimum" | "extent">
  dimensions: Pick<WaveformDimensions, "overviewArea" | "width" | "overviewHeight">
  waveform: Pick<
    WaveformData,
    "realSource" | "overviewSpan" | "overviewSignedPaths" | "overviewPath"
  >
  handlers: OverviewHandlers
}) {
  const { t } = useTranslation()
  return (
    <div
      ref={overviewArea}
      className="audio-detail-overview"
      role="slider"
      tabIndex={0}
      aria-label={t("detailAudio.overview")}
      aria-valuemin={minimum}
      aria-valuemax={extent}
      aria-valuenow={view.start}
      {...handlers}
    >
      <svg
        viewBox={`0 0 ${Math.max(1, width)} ${overviewHeight}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {realSource ? (
          <SignedWaveform paths={overviewSignedPaths} />
        ) : (
          <svg
            width={width}
            height={overviewHeight}
            viewBox={`${minimum} 0 ${overviewSpan} 100`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <path className="audio-detail-peak" d={overviewPath} />
          </svg>
        )}
      </svg>
      <div
        className="audio-detail-overview-frame"
        style={{
          left: `${((view.start - minimum) / overviewSpan) * 100}%`,
          width: `${(view.span / overviewSpan) * 100}%`,
        }}
      />
    </div>
  )
}
