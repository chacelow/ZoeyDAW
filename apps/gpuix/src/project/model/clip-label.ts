import type { Clip } from "./types"
import type { CreationNames } from "../defaults/template"

export function clipLabel(clip: Clip, names: Pick<CreationNames, "clip">): string {
  if (clip.label) {
    return clip.label
  }
  if (clip.kind === "audio") {
    return clip.samplePath.split(/[\\/]/).at(-1) || names.clip(clip.kind)
  }
  return names.clip(clip.kind)
}
