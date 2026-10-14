import { expect, it } from "vitest"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"
import { parseProject, stringifyProject } from "./persistence"
import { defaultAudioClipSettings } from "./audio-editor"
import { createDevice } from "./devices"

function detailDocument() {
  const document = createMockDocument()
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
  const restored = parseProject(stringifyProject(document, createMockWorkspace()))
  const restoredTrack = restored.document.tracks.find(item => item.id === track.id)
  const restoredClip = restoredTrack?.clips.find(item => item.id === clip.id)
  expect(restoredTrack?.devices).toEqual(track.devices)
  expect(restoredClip?.sourceOffsetBars ?? 0).toBe(clip.sourceOffsetBars ?? 0)
  expect(restoredClip).toMatchObject({
    lengthBars: clip.lengthBars,
    audioSettings: clip.audioSettings,
  })
})

it("rejects duplicate device identity within a track before restoring a snapshot", () => {
  const { document, track } = detailDocument()
  const device = createDevice("utility")
  track.devices = [device, { ...device }]
  expect(() =>
    parseProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  ).toThrow()
})

it("rejects invalid independent loop bounds without accepting malformed metadata", () => {
  const { document, clip } = detailDocument()
  if (!clip.audioSettings) throw new Error("Missing audio settings fixture")
  clip.audioSettings.loopLengthBars = 0
  expect(() =>
    parseProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  ).toThrow()
})
