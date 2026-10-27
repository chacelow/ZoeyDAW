import { Power } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { DragPadToggle } from "@zoeymind/ui"
import { clipLabel } from "@zoeydaw/project-core/clip-label"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { ClipNameInput } from "./NameInput"
import type { ClipContent } from "@zoeydaw/project-core/types"

/**
Clip identity heads the card it belongs to: a track-colored band with the
editable name and an active toggle for whether the clip plays. The dock tab
already titles the panel and closes it, so there is no close control.
*/
export function ClipCardHeader({
  clip,
  color,
  trailing,
}: {
  readonly clip: ClipContent
  readonly color: string
  readonly trailing?: React.ReactNode
}) {
  const { t } = useTranslation()
  const media = useProjectState(state => state.document.media)
  return (
    <div
      data-clip-editor-titlebar
      data-title-color={color}
      className="clip-editor-header border-border gap-control-gap flex items-center border-b px-2 text-xs"
      style={{
        backgroundColor: `color-mix(in oklab, ${color}, var(--arrangement-clip-paper) var(--arrangement-clip-tint))`,
        color: "var(--arrangement-clip-ink)",
      }}
    >
      <DragPadToggle
        size="compact"
        mappable={false}
        value={clip.mute !== true}
        onChange={enabled => projectActions.updateClip(clip.id, { mute: !enabled })}
        label={`${t("arrangement.clipEnabled")} ${clipLabel(clip, media)}`}
        icon={<Power />}
        color="var(--arrangement-clip-paper)"
        className="clip-editor-enable px-0"
      />
      <ClipNameInput key={clip.id} clip={clip} title={clipLabel(clip, media)} />
      <span className="min-w-0 truncate opacity-70">
        {t(
          clip.kind === "audio"
            ? "detail.audioClip"
            : clip.kind === "midi"
              ? "detail.midiClip"
              : "detail.patternClip"
        )}
      </span>
      {trailing ? <div className="ml-auto flex items-center">{trailing}</div> : null}
    </div>
  )
}
