import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { X } from "lucide-react"
import { clipLabel } from "@/pages/project/model/clip-label"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { AudioEditor } from "./AudioEditor"
import { MidiEditor } from "./MidiEditor"
import { PatternEditor } from "./PatternEditor"
import { ClipNameInput } from "./NameInput"
import { isEditableTarget } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
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
      className="flex h-full min-h-0 flex-col overflow-hidden"
      onKeyDown={event => {
        if (
          !event.defaultPrevented &&
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          event.key.toLowerCase() === "z" &&
          !isEditableTarget(event.target)
        ) {
          event.preventDefault()
          if (event.shiftKey) projectActions.redo()
          else projectActions.undo()
        }
        if (event.defaultPrevented) event.stopPropagation()
      }}
    >
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-2 py-1 text-xs">
        <ClipNameInput clip={clip} title={title} />
        <span className="text-muted-foreground">
          {t(
            clip.kind === "audio"
              ? "detail.audioClip"
              : clip.kind === "midi"
                ? "detail.midiClip"
                : "detail.patternClip"
          )}
        </span>
        <Button
          variant="ghost"
          size="control-icon"
          className="ml-auto"
          onClick={close}
          aria-label={t("arrangement.closeClipEditor")}
        >
          <X />
        </Button>
      </div>
      {clip.kind === "audio" && <AudioEditor clip={clip} />}
      {clip.kind === "pattern" && <PatternEditor clip={clip} />}
      {clip.kind === "midi" && <MidiEditor clip={clip} numerator={numerator} />}
    </div>
  )
}
