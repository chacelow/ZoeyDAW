import {
  addScene,
  updateScene,
  removeScene,
  moveScene,
  setLaunchQuantization,
  copyClipToSlot,
  moveClipSlot,
  createMidiClipSlot,
  putClipSlot,
} from "@zoeydaw/project-core/launcher"
import type { LauncherScene, LaunchQuantization } from "@zoeydaw/project-core/types"
import { document, get, launch, session } from "./context"

export const launcherActions = {
  addScene(name: string) {
    document(addScene(get().document, name))
  },
  updateScene(id: string, patch: Partial<Pick<LauncherScene, "name" | "color">>) {
    document(updateScene(get().document, id, patch))
  },
  removeScene(id: string) {
    document(removeScene(get().document, id))
  },
  moveScene(id: string, destination: number) {
    document(moveScene(get().document, id, destination))
  },
  setLaunchQuantization(value: LaunchQuantization) {
    document(setLaunchQuantization(get().document, value))
  },
  copyClipToSlot(clipId: string, trackId: string, sceneId: string) {
    document(copyClipToSlot(get().document, clipId, trackId, sceneId))
  },
  moveClipSlot(
    sourceTrack: string,
    sourceScene: string,
    targetTrack: string,
    targetScene: string,
    copy = false
  ) {
    document(moveClipSlot(get().document, sourceTrack, sourceScene, targetTrack, targetScene, copy))
  },
  createMidiClipSlot(trackId: string, sceneId: string) {
    document(createMidiClipSlot(get().document, trackId, sceneId))
  },
  deleteClipSlot(trackId: string, sceneId: string) {
    document(putClipSlot(get().document, trackId, sceneId, null))
  },
  selectClipSlot(trackId: string, sceneId: string) {
    const slot = get()
      .document.tracks.find(track => track.id === trackId)
      ?.clipSlots?.find(slot => slot.sceneId === sceneId)
    session({
      selectedTrackIds: [trackId],
      selectedClipIds: slot ? [slot.clip.id] : [],
      trackSelectionSurface: "launcher",
      editingClipId: slot?.clip.id ?? null,
      ...(slot ? { clipEditorRequest: get().session.clipEditorRequest + 1 } : {}),
    })
  },
  launchClip(trackId: string, sceneId: string) {
    launch({ kind: "clip", trackId, sceneId })
  },
  launchScene(sceneId: string) {
    launch({ kind: "scene", sceneId })
  },
  stopLauncherTrack(trackId: string) {
    launch({ kind: "stopTrack", trackId })
  },
  stopLauncherClips() {
    launch({ kind: "stopAll" })
  },
  returnToArrangement() {
    launch({ kind: "arrangement" })
  },
}
