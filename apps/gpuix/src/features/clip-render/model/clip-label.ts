/**
 * Default Clip display label by kind, mirroring the established convention
 * in `apps/web/src/pages/project/model/clip-label.ts`: an explicit
 * `clip.label` always wins; otherwise audio clips fall back to the sample
 * file name and MIDI/pattern clips fall back to a kind name.
 */
import type { Clip } from "../../../shared/model/types"

export function clipLabel(clip: Clip): string {
  if (clip.label) {
    return clip.label
  }
  if (clip.kind === "audio") {
    return clip.samplePath.split(/[\\/]/).at(-1) || "Audio Clip"
  }
  return clip.kind === "pattern" ? "Pattern" : "MIDI Clip"
}
