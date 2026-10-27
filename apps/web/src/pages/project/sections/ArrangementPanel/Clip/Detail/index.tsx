import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { AudioEditor } from "./AudioEditor"
import { MidiEditor } from "./MidiEditor"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import { isEditableTarget } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import type { ClipContent } from "@zoeydaw/project-core/types"
import { locateClip } from "@zoeydaw/project-core/clip-content"

export function ClipDetail({ clip: requestedClip }: { readonly clip: ClipContent }) {
  const { t } = useTranslation()
  const numerator = useProjectState(state => state.document.transport.numerator)
  const patterns = useProjectState(state => state.document.patterns)
  const tracks = useProjectState(state => state.document.tracks)
  const location = locateClip(tracks, requestedClip.id)
  const owner = location?.track
  const clip = location?.clip ?? requestedClip
  const color = clip.color ?? owner?.color ?? "var(--primary)"
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
      {/* Each editor owns its header: the clip's color and name sit at the top
          of that editor's card, not in a bar spanning the whole panel. */}
      {clip.kind === "audio" && <AudioEditor key={clip.id} clip={clip} color={color} />}
      {clip.kind !== "audio" && (
        <MidiEditor
          key={clip.id}
          clip={resolveMidiClip(clip, patterns)}
          sourceClip={clip}
          numerator={numerator}
          color={color}
        />
      )}
    </div>
  )
}
