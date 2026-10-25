import { Fragment, useMemo } from "react"
import type { RefObject } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { signedWaveformPaths } from "@zoeydaw/project-core/signed-waveform"
import type { SourceReference } from "@zoeydaw/project-core/realtime"
import { readProjectSource } from "@/pages/project/adapters/realtime"
import { SourcePlayhead } from "@/pages/project/components/SourcePlayhead"
import { browserLibrary } from "@/pages/project/adapters/browser"
import type { BrowserPreviewWaveformData } from "./useBrowserPreviewWaveform"

export function WaveformPreview({
  surface,
  width,
  path,
  data,
  source,
  duration,
}: {
  readonly surface: RefObject<HTMLDivElement | null>
  readonly width: number
  readonly path: string | undefined
  readonly data: BrowserPreviewWaveformData | null
  readonly source: SourceReference | null
  readonly duration: number
}) {
  const { t } = useTranslation()
  const channelPaths = useMemo(
    () =>
      data
        ? signedWaveformPaths(
            { peaks: [], start: 0, span: 1 },
            data.ranges,
            data.totalFrames,
            0,
            1,
            width,
            48
          )
        : [],
    [data, width]
  )
  return (
    <div
      ref={surface}
      role="slider"
      tabIndex={path ? 0 : -1}
      aria-label={t("browser.waveform")}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={0}
      aria-disabled={!path || !data}
      className="bg-muted/20 relative h-12 min-w-0 flex-1 cursor-pointer overflow-hidden"
      onClick={event => {
        if (!data) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (rect.width > 0) void browserLibrary.seek((event.clientX - rect.left) / rect.width)
      }}
      onKeyDown={event => {
        if (!data) return
        const position = source ? readProjectSource(source)?.seconds : undefined
        const progress = position !== undefined && duration > 0 ? position / duration : 0
        let next: number
        if (event.key === "ArrowLeft") next = progress - 0.05
        else if (event.key === "ArrowRight") next = progress + 0.05
        else if (event.key === "Home") next = 0
        else if (event.key === "End") next = 0.999
        else if (event.key === "Enter") next = progress
        else return
        event.preventDefault()
        event.stopPropagation()
        void browserLibrary.seek(next)
      }}
    >
      {data ? (
        <svg
          viewBox={`0 0 ${width} 48`}
          preserveAspectRatio="none"
          className="text-muted-foreground absolute inset-0 h-full w-full"
          aria-hidden
        >
          {channelPaths.map((channel, index) => (
            <Fragment key={index}>
              <path fill="currentColor" stroke="none" d={channel.path} />
              {channel.markers && <path fill="currentColor" d={channel.markers} />}
            </Fragment>
          ))}
        </svg>
      ) : null}
      {data ? (
        <SourcePlayhead source={source} startSeconds={0} spanSeconds={duration} slider={surface} />
      ) : null}
    </div>
  )
}
