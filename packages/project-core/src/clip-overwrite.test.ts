import { describe, expect, it } from "vitest"
import { createTestDocument } from "./test-fixtures"
import { defaultAudioClipSettings } from "./audio-editor"
import { insertClips, projectClipMove, projectClipResize, replaceClip } from "./clip-edits"
import { fadeWindow } from "./fades"
import type { AudioClip, Clip, Track } from "./types"

const identity = {
  clip: (key: string) => `copy:${key}`,
  automation: (key: string) => `copy:${key}`,
}
const original: AudioClip = {
  id: "original",
  kind: "audio",
  startBar: 1,
  lengthBars: 12,
  sourceOffsetBars: -2,
  sourceId: null,
  gainDb: -3,
  fadeInBars: 2,
  fadeOutBars: 3,
  audioSettings: { ...defaultAudioClipSettings(91, { lengthBars: 12 }), reverse: true, loop: true },
}
const winner: AudioClip = {
  id: "incoming",
  kind: "audio",
  startBar: 5,
  lengthBars: 3,
  sourceId: null,
  gainDb: 0,
}
function intervals(clips: readonly Clip[]) {
  return clips
    .map(clip => [clip.startBar, clip.startBar + clip.lengthBars])
    .sort((a, b) => a[0] - b[0])
}
function audioTrack(clips: Clip[]): Track {
  const track = createTestDocument().tracks.find(track => track.kind === "audio")
  if (!track) throw new Error("Missing fixture audio track")
  return { ...track, clips }
}

describe("incoming clip overwrite", () => {
  it("keeps both true source windows, reverse/loop settings and fade windows", () => {
    const result = insertClips([original], [winner], identity.clip, 144)
    expect(intervals(result)).toEqual([
      [1, 5],
      [5, 8],
      [8, 13],
    ])
    const left = result.find(clip => clip.id === original.id)
    const right = result.find(clip => clip.id === "copy:fragment:original:incoming")
    expect(left).toMatchObject({
      sourceOffsetBars: -2,
      lengthBars: 4,
      audioSettings: original.audioSettings,
      ...fadeWindow(original, 0, 4),
    })
    expect(right).toMatchObject({
      startBar: 8,
      sourceOffsetBars: 5,
      lengthBars: 5,
      audioSettings: original.audioSettings,
      ...fadeWindow(original, 7, 5),
    })
    expect(
      insertClips([original], [{ ...winner, startBar: 6 }], identity.clip).map(clip => clip.id)
    ).toEqual(result.map(clip => clip.id))
    expect(original).toMatchObject({ startBar: 1, lengthBars: 12, sourceOffsetBars: -2 })
  })

  it.each([
    [1, 12, [[1, 13]]],
    [
      1,
      4,
      [
        [1, 5],
        [5, 13],
      ],
    ],
    [
      9,
      4,
      [
        [1, 9],
        [9, 13],
      ],
    ],
    [
      13,
      2,
      [
        [1, 13],
        [13, 15],
      ],
    ],
  ] satisfies [number, number, number[][]][])(
    "subtracts [%s,+%s) but does not subtract touching boundaries",
    (startBar, lengthBars, expected) => {
      const result = insertClips([original], [{ ...winner, startBar, lengthBars }], identity.clip)
      expect(intervals(result)).toEqual(expected)
      if (startBar === 13) expect(result[0]).toBe(original)
      if (startBar === 1 && lengthBars === 12)
        expect(result).toEqual([{ ...winner, startBar, lengthBars }])
    }
  )

  it("freezes implicit audio and MIDI cycles before their fragment length changes", () => {
    const audio = { ...original, audioSettings: undefined }
    const midi: Clip = { id: "midi", kind: "midi", startBar: 1, lengthBars: 12, notes: [] }
    const result = insertClips([audio], [winner], identity.clip, 144)
    expect(result[0]).toMatchObject({ audioSettings: { sourceBpm: 144, loopLengthBars: 12 } })
    const midiResult = insertClips(
      [midi],
      [{ ...midi, id: "new-midi", startBar: 5, lengthBars: 3 }],
      identity.clip
    )
    expect(
      midiResult
        .filter(clip => clip.id !== "new-midi")
        .map(clip => (clip.kind === "midi" ? clip.loopBars : null))
    ).toEqual([12, 12])
  })

  it("removes the moving original before destination subtraction", () => {
    const track = audioTrack([original, { ...winner, startBar: 18, lengthBars: 4 }])
    const result = projectClipMove([track], [original.id], track.id, 2, false, false, identity)!
    expect(intervals(result.tracks[0].clips)).toEqual([
      [3, 15],
      [18, 22],
    ])
    expect(result.tracks[0].clips.filter(clip => clip.id === original.id)).toHaveLength(1)
  })

  it("copies over its source and resizes over neighbours using the same half-open rule", () => {
    const track = audioTrack([original])
    const copied = projectClipMove([track], [original.id], track.id, 2, true, false, identity)!
    expect(intervals(copied.tracks[0].clips)).toEqual([
      [1, 3],
      [3, 15],
    ])
    const resized = projectClipResize(winner, "left", 3)
    const replaced = replaceClip([audioTrack([original, winner])], resized, identity.clip)
    expect(intervals(replaced[0].clips)).toEqual([
      [1, 3],
      [3, 8],
      [8, 13],
    ])
    const repeat = replaceClip(
      [audioTrack([original, winner])],
      projectClipResize(winner, "left", 2),
      identity.clip
    )
    expect(repeat[0].clips.map(clip => clip.id)).toEqual(replaced[0].clips.map(clip => clip.id))
  })

  it("applies multiple incoming intervals without duplicating the remaining source", () => {
    const result = insertClips(
      [original],
      [winner, { ...winner, id: "second", startBar: 10, lengthBars: 1 }],
      identity.clip
    )
    expect(intervals(result)).toEqual([
      [1, 5],
      [5, 8],
      [8, 10],
      [10, 11],
      [11, 13],
    ])
    expect(new Set(result.map(clip => clip.id)).size).toBe(result.length)
    expect(result.find(clip => clip.startBar === 11)).toMatchObject({ sourceOffsetBars: 8 })
  })
})
