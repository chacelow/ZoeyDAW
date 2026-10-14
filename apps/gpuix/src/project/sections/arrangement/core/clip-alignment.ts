import type { ArrangementScene } from "./scene"

export function alignmentBar(scene: ArrangementScene): number | null {
  const id = scene.clipDrag ? scene.clipDrag.ids.values().next().value : scene.clipResize?.id
  if (!id) {
    return null
  }
  for (const track of scene.tracks) {
    const clip = track.clips.find(clip => clip.id === id)
    if (clip) {
      return clip.startBar
    }
  }
  return null
}
