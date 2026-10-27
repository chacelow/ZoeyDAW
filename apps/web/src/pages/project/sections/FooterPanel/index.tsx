import { useTranslation } from "@zoeymind/i18n"
import { useProjectState } from "@/pages/project/adapters"
import { ClipDetail } from "../ArrangementPanel/Clip/Detail"
import { EffectChain } from "./EffectChain"
import type { DetailSection } from "@/pages/project/detail-view"
import { locateClip } from "@zoeydaw/project-core/clip-content"

export function FooterPanel({ view }: { readonly view: DetailSection }) {
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
  const location = locateClip(tracks, clipId)
  const owner = location?.track
  const clip = location?.clip
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
        <ClipDetail key={clip.id} clip={clip} />
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
