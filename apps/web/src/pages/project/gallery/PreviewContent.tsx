import { useTranslation } from "@zoeymind/i18n"
import type { Track } from "@zoeydaw/project-core/types"
import { TimelineCanvas } from "../sections/ArrangementPanel/Timeline/TimelineCanvas"
import { useArrangementKeyboard } from "../sections/ArrangementPanel/Timeline/useArrangementKeyboard"
import { ClipDetail } from "../sections/ArrangementPanel/Clip/Detail"
import { EffectChain } from "../sections/FooterPanel/EffectChain"
import type { PreviewKind } from "./fixtures"

function EditorPreviewKeyboard() {
  useArrangementKeyboard({ snapshots: false })
  return null
}

export function PreviewContent({
  kind,
  timelineOpen,
  editorOpen,
  selected,
  clip,
}: {
  readonly kind: PreviewKind
  readonly timelineOpen: boolean
  readonly editorOpen: boolean
  readonly selected: Track | undefined
  readonly clip: Track["clips"][number] | undefined
}) {
  const { t } = useTranslation()
  const editorFocused =
    kind === "audio" || kind === "piano-roll" || kind === "devices" || kind === "track-editor"
  return (
    <>
      {!timelineOpen && <EditorPreviewKeyboard />}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
        data-gallery-preview-surface
      >
        {timelineOpen && (
          <div
            className={editorFocused ? "order-2 h-80 shrink-0" : "order-1 min-h-80 flex-1"}
            data-gallery-preview-arrangement
          >
            <TimelineCanvas snapshots={false} />
          </div>
        )}
        {kind === "devices" ? (
          <div
            data-gallery-preview-devices
            className={`border-border order-1 min-w-0 flex-1 ${timelineOpen ? "min-h-80 border-b" : "min-h-0"}`}
          >
            <EffectChain track={selected ?? null} />
          </div>
        ) : clip ? (
          <div
            data-gallery-preview-editor
            className={`project-arrangement border-border min-w-0 ${editorFocused ? "order-1 flex-1" : "order-2 h-80 shrink-0 border-t"} ${editorFocused && timelineOpen ? "min-h-80 border-b" : "min-h-0"}`}
          >
            <ClipDetail clip={clip} />
          </div>
        ) : editorFocused || editorOpen ? (
          <p
            role="status"
            className="text-muted-foreground order-1 flex flex-1 items-center justify-center p-2 text-xs"
          >
            {t("galleryProject.noClip")}
          </p>
        ) : null}
      </div>
    </>
  )
}
