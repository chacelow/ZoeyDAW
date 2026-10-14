import { useTranslation } from "@zoeymind/i18n"
import { clipLabel } from "@/pages/project/model/clip-label"
import { useProjectState } from "@/pages/project/adapters"
import { AudioEditor } from "./AudioEditor"
import { MidiEditor } from "./MidiEditor"
import { PatternEditor } from "./PatternEditor"
import { ClipNameInput } from "./NameInput"
import type { Clip } from "@/pages/project/model/types"

export function ClipDetail({ clip, close }: { readonly clip: Clip; readonly close: () => void }) {
  const { t } = useTranslation()
  const numerator = useProjectState(state => state.document.transport.numerator)
  const title = clipLabel(clip)
  return (
    <div
      data-clip-editor
      role="region"
      aria-label={t("arrangement.clipEditor")}
      className="border-border bg-background absolute inset-x-0 bottom-0 z-40 flex h-[190px] flex-col border-t shadow-xl"
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2 text-xs">
        <ClipNameInput clip={clip} title={title} />
        <span className="text-muted-foreground">
          {clip.kind} · {clip.lengthBars.toFixed(2)} bars
          {" · "}
          {t("arrangement.temporaryEditor")}
        </span>
        <button
          type="button"
          className="hover:bg-muted ml-auto rounded px-2"
          onClick={close}
          aria-label={t("arrangement.closeClipEditor")}
        >
          ×
        </button>
      </div>
      {clip.kind === "audio" && <AudioEditor clip={clip} />}
      {clip.kind === "pattern" && <PatternEditor clip={clip} />}
      {clip.kind === "midi" && <MidiEditor clip={clip} numerator={numerator} />}
    </div>
  )
}
