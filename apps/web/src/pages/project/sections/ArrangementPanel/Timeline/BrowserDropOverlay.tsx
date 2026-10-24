import { FileAudio } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { TRACK_TITLE_HEIGHT } from "@/pages/project/layout"
import type { useBrowserAudioDrop } from "./useBrowserAudioDrop"

export function BrowserDropOverlay({
  browserDrop,
}: {
  readonly browserDrop: Pick<
    ReturnType<typeof useBrowserAudioDrop>,
    "target" | "source" | "importing"
  >
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
        {browserDrop.target && browserDrop.source && (
          <div
            data-browser-audio-ghost
            data-duration-known={browserDrop.target.width !== null}
            className="absolute overflow-hidden"
            style={{
              left: browserDrop.target.left,
              top: browserDrop.target.top,
              width: browserDrop.target.width ?? "max-content",
              maxWidth: browserDrop.target.width === null ? "100%" : undefined,
              height: browserDrop.target.height,
              border: `1px solid ${browserDrop.target.color}`,
              background: `color-mix(in srgb, ${browserDrop.target.color} 24%, transparent)`,
            }}
          >
            <div
              className="flex items-center gap-1 overflow-hidden px-1 text-[11px] whitespace-nowrap"
              style={{
                height: TRACK_TITLE_HEIGHT,
                background: browserDrop.target.color,
                color: "var(--arrangement-clip-ink)",
              }}
            >
              <FileAudio className="size-3 shrink-0" />
              <span className="truncate">{browserDrop.source.name}</span>
            </div>
            <span className="text-foreground block truncate px-1 text-[10px]">
              {!browserDrop.target.trackId && `${t("settings.import.newTrack")} · `}
              {browserDrop.source.durationSeconds === null
                ? t("settings.import.durationUnknown")
                : t("settings.import.sourceDuration", {
                    duration: browserDrop.source.durationSeconds.toFixed(2),
                  })}
            </span>
            <div
              className="absolute inset-y-0 left-0 w-0.5"
              style={{ background: browserDrop.target.color }}
              data-browser-audio-start-guide
            />
          </div>
        )}
      </div>
      {browserDrop.importing && (
        <div
          role="status"
          className="bg-background text-muted-foreground pointer-events-none absolute top-1 right-1 z-30 px-2 py-1 text-xs"
        >
          {t("settings.import.importing")}
        </div>
      )}
    </>
  )
}
