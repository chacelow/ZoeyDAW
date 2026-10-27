import { expect, it } from "vitest"
import { createTestDocument, createTestWorkspace } from "./test-fixtures"
import { parseProject, stringifyProject } from "./persistence"
import { defaultAudioClipSettings } from "./audio-editor"
import { createDevice } from "./devices"

function detailDocument() {
  const document = createTestDocument()
  const track = document.tracks.find(item => item.kind === "audio" && item.clips.length > 0)
  const clip = track?.clips.find(item => item.kind === "audio")
  if (!track || !clip) throw new Error("Missing audio fixture")
  track.devices = [createDevice("utility"), createDevice("delay")]
  clip.audioSettings = {
    ...defaultAudioClipSettings(document.transport.bpm, clip),
    loopStartBars: 2,
    loopLengthBars: 1.5,
    transpose: -12,
    reverse: true,
  }
  return { document, track, clip }
}

it("roundtrips independent audio loop settings and an ordered per-track device chain", () => {
  const { document, track, clip } = detailDocument()
  const restored = parseProject(stringifyProject(document, createTestWorkspace()))
  const restoredTrack = restored.document.tracks.find(item => item.id === track.id)
  const restoredClip = restoredTrack?.clips.find(item => item.id === clip.id)
  expect(restoredTrack?.devices).toEqual(track.devices)
  expect(restoredClip?.sourceOffsetBars ?? 0).toBe(clip.sourceOffsetBars ?? 0)
  expect(restoredClip).toMatchObject({
    lengthBars: clip.lengthBars,
    audioSettings: clip.audioSettings,
  })
})

it("roundtrips an unresolved source grid without treating its numeric coordinate basis as tempo", () => {
  const { document, clip } = detailDocument()
  clip.sourceTempo = "unknown"
  if (!clip.audioSettings) throw new Error("Missing audio settings")
  clip.audioSettings.warp = false
  const restored = parseProject(stringifyProject(document, createTestWorkspace()))
  expect(
    restored.document.tracks.flatMap(track => track.clips).find(item => item.id === clip.id)
  ).toMatchObject({ sourceTempo: "unknown", audioSettings: { warp: false, sourceBpm: 120 } })
  clip.audioSettings.warp = true
  expect(() => parseProject(stringifyProject(document, createTestWorkspace()))).toThrow()
})
it.each(["beats", "tones", "texture", "complex", "complex-pro", "repitch"])(
  "restores legacy %s using its original processor rather than retaining an obsolete runtime mode",
  legacyMode => {
    const { document, clip } = detailDocument()
    const payload = JSON.parse(stringifyProject(document, createTestWorkspace()))
    const track = payload.document.tracks.find((item: { clips: { id: string }[] }) =>
      item.clips.some((item: { id: string }) => item.id === clip.id)
    )
    const savedClip = track.clips.find((item: { id: string }) => item.id === clip.id)
    savedClip.audioSettings.warpMode = legacyMode
    const restored = parseProject(JSON.stringify(payload))
    const restoredClip = restored.document.tracks
      .flatMap(item => item.clips)
      .find(item => item.id === clip.id)
    if (restoredClip?.kind !== "audio") throw new Error("Audio clip was not restored")
    expect(restoredClip.audioSettings?.warpMode).toBe(
      legacyMode === "repitch" ? "re-pitch" : "soundtouch"
    )
    expect(
      JSON.parse(stringifyProject(restored.document, restored.workspace)).document.tracks.flatMap(
        (item: { clips: unknown[] }) => item.clips
      )
    ).toContainEqual(
      expect.objectContaining({
        id: clip.id,
        audioSettings: expect.objectContaining({ warpMode: restoredClip.audioSettings?.warpMode }),
      })
    )
  }
)

it("rejects unknown saved warp modes after explicit legacy conversion", () => {
  const { document, clip } = detailDocument()
  const payload = JSON.parse(stringifyProject(document, createTestWorkspace()))
  const savedClip = payload.document.tracks
    .flatMap((item: { clips: unknown[] }) => item.clips)
    .find((item: { id: string }) => item.id === clip.id)
  savedClip.audioSettings.warpMode = "unsupported"
  expect(() => parseProject(JSON.stringify(payload))).toThrow()
})

it("rejects duplicate device identity within a track before restoring a snapshot", () => {
  const { document, track } = detailDocument()
  const device = createDevice("utility")
  track.devices = [device, { ...device }]
  expect(() =>
    parseProject(JSON.stringify({ version: 3, document, workspace: createTestWorkspace() }))
  ).toThrow()
})

it("rejects invalid independent loop bounds without accepting malformed metadata", () => {
  const { document, clip } = detailDocument()
  if (!clip.audioSettings) throw new Error("Missing audio settings fixture")
  clip.audioSettings.loopLengthBars = 0
  expect(() =>
    parseProject(JSON.stringify({ version: 3, document, workspace: createTestWorkspace() }))
  ).toThrow()
})
