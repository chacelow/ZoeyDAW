import { describe, expect, it } from "vitest"
import { initialDocument } from "@zoeydaw/project-runtime/state"
import type { NativeRecording } from "@/shared/native/audio"
import type { AudioClip } from "@zoeydaw/project-core/types"
import { applyRecording } from "./recording"

function fixture() {
  const document = initialDocument(80)
  const track = document.tracks.find(item => item.kind === "audio")
  if (!track) throw new Error("The initial project must contain an audio track")
  const recording: NativeRecording = {
    recordingId: "take-1",
    sessionId: "session-1",
    sourceBpm: 120,
    sources: [
      {
        id: "file-1",
        name: "take.wav",
        sha256: "a".repeat(64),
        byteLength: 768044,
        sampleRate: 48000,
        frames: 192000,
        channels: 2,
        location: { kind: "external", path: "/recordings/take.wav" },
      },
    ],
    clips: [
      {
        clipId: "clip-1",
        fileId: "file-1",
        trackId: track.id,
        startBar: 2,
        durationBars: 0.5,
        sourceOffsetBars: 0.25,
      },
    ],
  }
  return { document, track, recording }
}

describe("recorded audio publication reducer", () => {
  it("uses inspected source duration and captured tempo without mutating its input", () => {
    const { document, track, recording } = fixture()
    const result = applyRecording(document, recording)
    const clip = result.tracks
      .find(item => item.id === track.id)
      ?.clips.find(item => item.id === "clip-1")
    expect(result.media).toContainEqual(recording.sources[0])
    expect(clip).toMatchObject({
      kind: "audio",
      sourceId: "file-1",
      startBar: 2,
      lengthBars: 0.5,
      sourceOffsetBars: 0.25,
      gainDb: 0,
      audioSettings: {
        sourceBpm: 120,
        loop: false,
        loopStartBars: 0,
        loopLengthBars: 2,
        startMarkerBars: 0.25,
        endMarkerBars: 0.75,
      },
    })
    expect(document.media.some(source => source.id === "file-1")).toBe(false)
    expect(track.clips.some(item => item.id === "clip-1")).toBe(false)
    expect(applyRecording(result, recording)).toBe(result)
  })

  it("does not resurrect recorded clips removed after successful publication", () => {
    const { document, recording } = fixture()
    const result = applyRecording(document, recording)
    const edited = {
      ...result,
      tracks: result.tracks.map(track => ({
        ...track,
        clips: track.clips.filter(clip => clip.id !== "clip-1"),
      })),
    }
    expect(applyRecording(edited, recording)).toBe(edited)
  })

  it("recovers into isolated new tracks without overwriting existing clips and replays once", () => {
    const { document, recording, track } = fixture()
    const occupied: AudioClip = {
      id: "original",
      kind: "audio",
      sourceId: null,
      gainDb: 0,
      startBar: 1,
      lengthBars: 4,
    }
    const original = {
      ...document,
      tracks: document.tracks.map(item =>
        item.id === track.id ? { ...item, clips: [occupied] } : item
      ),
    }
    const recovered = {
      ...recording,
      recovery: true,
      clips: recording.clips.map(clip => ({
        ...clip,
        trackId: `recovery:${recording.recordingId}:${clip.trackId}`,
      })),
    }
    const result = applyRecording(original, recovered)
    expect(result.tracks.find(item => item.id === track.id)?.clips).toEqual(
      original.tracks.find(item => item.id === track.id)?.clips
    )
    expect(result.tracks.find(item => item.id === recovered.clips[0]?.trackId)).toMatchObject({
      kind: "audio",
      input: "none",
      monitor: "off",
      output: "main",
      clips: [{ id: "clip-1", sourceId: "file-1", startBar: 2, lengthBars: 0.5 }],
    })
    expect(applyRecording(result, recovered)).toBe(result)
  })

  it("rejects missing or incompatible destinations without adding media", () => {
    const { document, track, recording } = fixture()
    const missing = { ...document, tracks: document.tracks.filter(item => item.id !== track.id) }
    expect(() => applyRecording(missing, recording)).toThrow("destination no longer exists")
    const incompatible = {
      ...recording,
      clips: recording.clips.map(clip => ({ ...clip, trackId: "unavailable" })),
    }
    expect(() => applyRecording(document, incompatible)).toThrow("destination no longer exists")
    expect(document.media.some(source => source.id === "file-1")).toBe(false)
  })

  it("rejects mismatched media identities", () => {
    const { document, recording } = fixture()
    const source = recording.sources[0]
    if (!source) throw new Error("The recording fixture must contain a source")
    const conflicting = { ...document, media: [...document.media, { ...source, frames: 1 }] }
    expect(() => applyRecording(conflicting, recording)).toThrow("media identity conflicts")
  })

  it("overwrites rather than stacks and retains stable fragment identities on replay", () => {
    const { document, track, recording } = fixture()
    const occupied = {
      ...document,
      tracks: document.tracks.map(item =>
        item.id === track.id
          ? {
              ...item,
              clips: [
                {
                  id: "existing",
                  kind: "audio",
                  sourceId: null,
                  startBar: 1,
                  lengthBars: 3,
                  gainDb: 0,
                } satisfies AudioClip,
              ],
            }
          : item
      ),
    }
    const result = applyRecording(occupied, recording)
    const clips = result.tracks.find(item => item.id === track.id)?.clips
    expect(clips?.map(clip => [clip.startBar, clip.lengthBars])).toEqual([
      [1, 1],
      [2.5, 1.5],
      [2, 0.5],
    ])
    expect(applyRecording(result, recording)).toBe(result)
  })
})
