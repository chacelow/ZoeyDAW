import type { Clip } from "./types"

export function clipLabel(clip: Clip): string {
  if (clip.label) return clip.label
  if (clip.kind === "audio") return clip.samplePath.split(/[\\/]/).at(-1) || "Audio Clip"
  return clip.kind === "pattern" ? "Pattern" : "MIDI Clip"
}
