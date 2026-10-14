import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { ClipDetail } from "../ArrangementPanel/Clip/Detail"
import { EffectChain } from "./EffectChain"
import type { DetailSection } from "@/pages/project/detail-view"

export function FooterPanel({
  view,
  onClose,
}: {
  readonly view: DetailSection
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const tracks = useProjectState(state => state.document.tracks)
  const selectedClipIds = useProjectState(state => state.session.selectedClipIds)
  const editingClipId = useProjectState(state => state.session.editingClipId)
  const selectedTrackIds = useProjectState(state => state.session.selectedTrackIds)
  const clipId =
    selectedClipIds.length === 1
      ? selectedClipIds[0]
      : selectedClipIds.length
        ? null
        : editingClipId
  const owner = tracks.find(track => track.clips.some(clip => clip.id === clipId))
  const clip = owner?.clips.find(item => item.id === clipId)
  const track =
    tracks.find(item => item.id === selectedTrackIds[selectedTrackIds.length - 1]) ?? owner ?? null

  return (
    <div
      data-detail-panel={view}
      className="project-detail flex h-full min-h-0 flex-col overflow-hidden"
    >
      {view === "devices" ? (
        <EffectChain key={track?.id ?? "empty"} track={track} />
      ) : clip ? (
        <ClipDetail key={clip.id} clip={clip} close={onClose} />
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
          {t(selectedClipIds.length > 1 ? "detail.multipleClips" : "detail.noClip", {
            count: selectedClipIds.length,
          })}
        </div>
      )}
    </div>
  )
}
