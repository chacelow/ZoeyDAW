import { useTranslation } from "@zoeymind/i18n"
import type { Clip } from "@/pages/project/model/types"
import { clipLabel } from "@/pages/project/model/clip-label"
import { useProjectState } from "@/pages/project/adapters"
import { AudioEditor } from "./AudioEditor"
import { MidiEditor } from "./MidiEditor"
import { PatternEditor } from "./PatternEditor"
import { ClipNameInput } from "./NameInput"

export function ClipDetail({ clip, close }: { clip: Clip; close: () => void }) {
  const { t } = useTranslation()
  const numerator = useProjectState(state => state.document.transport.numerator)
  const title = clipLabel(clip)
  return (
    <div
      data-clip-editor
      className="absolute inset-x-0 bottom-0 z-40 flex h-[190px] flex-col border-t border-border bg-background shadow-xl"
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
        <ClipNameInput clip={clip} title={title} />
        <span className="text-muted-foreground">
          {clip.kind} · {clip.lengthBars.toFixed(2)} bars
          {" · "}
          {t("arrangement.temporaryEditor")}
        </span>
        <button
          className="ml-auto rounded px-2 hover:bg-muted"
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
