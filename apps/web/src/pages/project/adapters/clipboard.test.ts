import { beforeEach, describe, expect, it } from "vitest"
import { parseClipClipboard } from "../model/clip-clipboard"
import { createMockDocument, createMockWorkspace } from "./fixtures"
import { hydrateProject, projectActions, useProjectState } from "./index"

beforeEach(() =>
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
)

function clips(trackId: string) {
  return useProjectState.getState().document.tracks.find(track => track.id === trackId)?.clips ?? []
}

describe("clip clipboard edits", () => {
  it("pastes trimmed audio and MIDI with cloned IDs, lane offsets and one undo entry", () => {
    const audio = clips("3-audio")[0]
    const midi = clips("trager")[0]
    const trimmed = {
      ...audio,
      startBar: audio.startBar + 2,
      lengthBars: audio.lengthBars - 2,
      sourceOffsetBars: 2,
      ...(audio.kind === "audio" && { fadeInBars: 0, fadeOutBars: 0 }),
    }
    const payload = parseClipClipboard(
      JSON.stringify({
        kind: "clips",
        version: 1,
        items: [
          { trackOffset: 0, barOffset: 0, clip: trimmed },
          { trackOffset: 1, barOffset: 3, clip: { ...midi, startBar: 8 } },
        ],
      })
    )
    if (!payload) {
      throw new Error("Invalid clipboard fixture")
    }
    const beforeAudio = clips("3-audio").length
    const beforeMidi = clips("4-midi").length
    projectActions.beginEdit()
    expect(projectActions.pasteClips("3-audio", 21, payload)).toBe(true)
    projectActions.endEdit()
    expect(clips("3-audio")).toHaveLength(beforeAudio + 1)
    expect(clips("4-midi")).toHaveLength(beforeMidi + 1)
    expect(clips("3-audio").at(-1)).toMatchObject({ startBar: 21, sourceOffsetBars: 2 })
    expect(clips("4-midi").at(-1)).toMatchObject({ startBar: 24, kind: "midi" })
    expect(clips("3-audio").at(-1)?.id).not.toBe(audio.id)
    projectActions.undo()
    expect(clips("3-audio")).toHaveLength(beforeAudio)
    expect(clips("4-midi")).toHaveLength(beforeMidi)
  })
  it("rejects incompatible destination atomically and cuts only one document history entry", () => {
    const payload = projectActions.copyClips(["audio-1"])
    if (!payload) {
      throw new Error("Missing audio fixture")
    }
    const midiCount = clips("4-midi").length
    expect(projectActions.pasteClips("4-midi", 15, payload)).toBe(false)
    expect(clips("4-midi")).toHaveLength(midiCount)
    projectActions.beginEdit()
    projectActions.cutClips(["audio-1"])
    projectActions.endEdit()
    expect(clips("3-audio").some(clip => clip.id === "audio-1")).toBe(false)
    projectActions.undo()
    expect(clips("3-audio").some(clip => clip.id === "audio-1")).toBe(true)
  })
})
