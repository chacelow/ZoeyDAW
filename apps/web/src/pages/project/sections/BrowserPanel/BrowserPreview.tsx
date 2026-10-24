import { Headphones, Square } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { browserLibrary } from "@/pages/project/adapters/browser"
import type { BrowserLibraryState } from "@/pages/project/adapters/browser"
import { useBrowserPreviewWaveform } from "./useBrowserPreviewWaveform"
import { WaveformPreview } from "./WaveformPreview"

export function BrowserPreview({ state }: { readonly state: BrowserLibraryState }) {
  const { t } = useTranslation()
  const item = state.selection[state.scope]
  const path = item?.kind === "audio" ? item.path : undefined
  const { surface, width, data, error } = useBrowserPreviewWaveform(path)
  const status =
    state.audition.kind === "ready" && state.audition.itemId === item?.id ? state.audition : null
  const position = status?.positionSeconds ?? 0
  const duration = status?.durationSeconds ?? data?.durationSeconds ?? 0
  return (
    <div className="border-border flex shrink-0 flex-col gap-1 border-t p-1">
      <div className="flex items-center gap-1">
        <Button
          size="control-icon"
          variant="ghost"
          aria-label={t("browser.autoPreview")}
          title={t("browser.autoPreview")}
          aria-pressed={state.auditionEnabled}
          onClick={() => browserLibrary.setAuditionEnabled(!state.auditionEnabled)}
        >
          <Headphones />
        </Button>
        <WaveformPreview
          surface={surface}
          width={width}
          path={path}
          data={data}
          position={position}
          duration={duration}
        />
        <Button
          variant="ghost"
          size="control-icon"
          aria-label={t("browser.stop")}
          onClick={() => void browserLibrary.stopAudition()}
        >
          <Square />
        </Button>
      </div>
      <div className="text-muted-foreground flex justify-between gap-1 text-[10px] tabular-nums">
        <span className="min-w-0 truncate">{path ? item.name : t("browser.noSelection")}</span>
        <span>
          {position.toFixed(1)} / {duration.toFixed(1)} s
        </span>
      </div>
      {state.audition.kind === "error" ? (
        <span role="alert" className="text-destructive text-xs">
          {state.audition.error === "auditionUnavailable"
            ? t("browser.errors.auditionUnavailable")
            : state.audition.error}
        </span>
      ) : error ? (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      ) : null}
    </div>
  )
}
