import { useEffect } from "react"
import { projectActions, useProjectState } from "../adapters"
import type { PreviewKind } from "./fixtures"

export function useGalleryEditorSelection(kind: PreviewKind, editorOpen: boolean) {
  const trackId = useProjectState(state => state.session.selectedTrackIds[0])
  const selectedClipIds = useProjectState(state => state.session.selectedClipIds)
  useEffect(() => {
    if (kind !== "track-editor" || !editorOpen || !trackId) return
    const state = useProjectState.getState()
    const track = state.document.tracks.find(item => item.id === trackId)
    if (!track) return
    const selected = track.clips.find(clip => selectedClipIds.includes(clip.id))
    const existing = track.clips.find(clip => clip.id === state.session.editingClipId)
    const next = selected?.id ?? existing?.id ?? track.clips[0]?.id ?? null
    if (next !== state.session.editingClipId) projectActions.setEditingClip(next)
  }, [kind, editorOpen, trackId, selectedClipIds])
}
