import { describe, expect, it } from "vitest"
import { createTestDocument } from "./test-fixtures"
import { collectClips, parseClipClipboard } from "./clip-clipboard"
import type { MidiPattern, PatternClip } from "./types"

const document = createTestDocument()
const sharedPattern: MidiPattern = {
  id: "shared-pattern",
  loopBars: 2,
  notes: [{ id: "note-1", pitch: 60, startBeat: 0.5, lengthBeats: 1.25, velocity: 100 }],
}
const patternClip: PatternClip = {
  id: "pattern-clip",
  kind: "pattern",
  patternId: sharedPattern.id,
  startBar: 2,
  lengthBars: 4,
  sourceOffsetBars: 0.25,
}

describe("clip clipboard boundary", () => {
  it("retains multi-lane spacing and trimmed source data through serialization", () => {
    const audio = document.tracks.find(track => track.id === "3-audio")
    const midi = document.tracks.find(track => track.id === "4-midi")
    const midiSource = document.tracks.find(track => track.id === "trager")?.clips[0]
    if (!audio || !midi || !midiSource) {
      throw new Error("Missing clipboard lanes")
    }
    const source = {
      ...audio.clips[0],
      startBar: 5.5,
      sourceOffsetBars: 2,
      fadeInOffsetBars: 0.25,
      fadeInBars: 0.5,
      fadeOutOffsetBars: 0.25,
      fadeOutBars: 0.5,
    }
    const note = { ...midiSource, startBar: 9 }
    const tracks = document.tracks.map(track =>
      track.id === audio.id
        ? { ...track, clips: [source] }
        : track.id === midi.id
          ? { ...track, clips: [note] }
          : { ...track, clips: [] }
    )
    const encoded = collectClips(tracks, [source.id, note.id], undefined, 120, document.patterns)
    expect(encoded).not.toBeNull()
    const parsed = parseClipClipboard(JSON.stringify(encoded))
    expect(parsed?.items.map(item => [item.trackOffset, item.barOffset])).toEqual([
      [0, 0],
      [1, 3.5],
    ])
    expect(parsed?.items[0].clip.sourceOffsetBars).toBe(2)
    expect(parsed?.items[0].clip).toMatchObject({
      fadeInOffsetBars: 0.25,
      fadeInBars: 0.5,
      fadeOutOffsetBars: 0.25,
      fadeOutBars: 0.5,
      sourceId: "mock://kick.wav",
    })
    expect(parsed?.items[0].clip).not.toHaveProperty("samplePath")
    expect(parsed?.items[0].clip).not.toHaveProperty("waveformPeaks")
    expect(parsed?.items[1].clip).toMatchObject({ kind: note.kind, startBar: 9 })
  })
  it("clips fade intervals and inward offsets at a copied source window", () => {
    const audio = document.tracks.find(track => track.id === "3-audio")
    if (!audio) {
      throw new Error("Missing audio lane")
    }
    const candidate = {
      ...audio.clips[0],
      fadeInOffsetBars: 1,
      fadeInBars: 3,
      fadeOutOffsetBars: 2,
      fadeOutBars: 3,
    }
    const tracks = document.tracks.map(track =>
      track.id === audio.id ? { ...track, clips: [candidate] } : track
    )
    const encoded = collectClips(
      tracks,
      [candidate.id],
      {
        startBar: 3,
        endBar: 10,
        trackIds: [audio.id],
      },
      120,
      document.patterns
    )
    const parsed = encoded && parseClipClipboard(JSON.stringify(encoded))
    expect(parsed?.items[0].clip).toMatchObject({
      sourceOffsetBars: 2,
      fadeInOffsetBars: 0,
      fadeInBars: 2,
      fadeOutOffsetBars: 0,
      fadeOutBars: 0,
    })
  })
  it("rejects malformed versions, forged source fields and duplicate IDs", () => {
    const sample = collectClips(document.tracks, ["audio-1"], undefined, 120, document.patterns)
    if (!sample) {
      throw new Error("Missing clipboard fixture")
    }
    expect(parseClipClipboard(JSON.stringify({ ...sample, version: 2 }))).toBeNull()
    expect(
      parseClipClipboard(
        JSON.stringify({
          ...sample,
          items: [{ ...sample.items[0], clip: { ...sample.items[0].clip, lengthBars: -1 } }],
        })
      )
    ).toBeNull()
    expect(
      parseClipClipboard(
        JSON.stringify({
          ...sample,
          items: [{ ...sample.items[0], clip: { ...sample.items[0].clip, sourceId: "" } }],
        })
      )
    ).toBeNull()
    expect(
      parseClipClipboard(
        JSON.stringify({
          ...sample,
          items: [{ ...sample.items[0], clip: { ...sample.items[0].clip, sourceId: null } }],
        })
      )?.items[0].clip
    ).toMatchObject({ sourceId: null })
    expect(
      parseClipClipboard(JSON.stringify({ ...sample, items: [sample.items[0], sample.items[0]] }))
    ).toBeNull()
    expect(parseClipClipboard("{not-json")).toBeNull()
  })
  it("copies shared pattern content once, independently of the source document and trim", () => {
    const pattern = structuredClone(sharedPattern)
    const otherClip = { ...patternClip, id: "pattern-copy", startBar: 7 }
    const tracks = document.tracks.map(track => ({
      ...track,
      clips: track.id === "4-midi" ? [patternClip, otherClip] : [],
    }))
    const copied = collectClips(
      tracks,
      [patternClip.id, otherClip.id],
      {
        startBar: 3,
        endBar: 9,
        trackIds: ["4-midi"],
      },
      120,
      [pattern, { ...pattern, id: "unused" }]
    )
    if (!copied) throw new Error("Missing pattern clipboard")
    expect(copied.patterns).toEqual([sharedPattern])
    expect(copied.items[0].clip).toMatchObject({
      kind: "pattern",
      patternId: sharedPattern.id,
      startBar: 3,
      lengthBars: 3,
      sourceOffsetBars: 1.25,
    })
    pattern.notes[0].pitch = 72
    pattern.loopBars = 8
    const parsed = parseClipClipboard(JSON.stringify(copied))
    expect(parsed?.patterns).toEqual([sharedPattern])
    expect(parsed?.items.map(item => item.clip.kind === "pattern" && item.clip.patternId)).toEqual([
      sharedPattern.id,
      sharedPattern.id,
    ])
    expect(collectClips(tracks, [patternClip.id])).toBeNull()
  })

  it("rejects missing shared content, malformed notes, loops and duplicate pattern IDs", () => {
    const payload = {
      kind: "clips",
      version: 1,
      items: [{ trackOffset: 0, barOffset: 0, clip: patternClip }],
      patterns: [sharedPattern],
    }
    expect(parseClipClipboard(JSON.stringify(payload))?.patterns).toEqual([sharedPattern])
    expect(parseClipClipboard(JSON.stringify({ ...payload, patterns: [] }))).toBeNull()
    expect(parseClipClipboard(JSON.stringify({ ...payload, patterns: null }))).toBeNull()
    expect(parseClipClipboard(JSON.stringify({ ...payload, patterns: undefined }))).toBeNull()
    expect(
      parseClipClipboard(
        JSON.stringify({
          ...payload,
          patterns: [sharedPattern, sharedPattern],
        })
      )
    ).toBeNull()
    for (const loopBars of [0, -1, null, "2"]) {
      expect(
        parseClipClipboard(
          JSON.stringify({
            ...payload,
            patterns: [{ ...sharedPattern, loopBars }],
          })
        )
      ).toBeNull()
    }
    const note = sharedPattern.notes[0]
    for (const notes of [
      null,
      [{ ...note, pitch: 128 }],
      [{ ...note, pitch: 60.5 }],
      [{ ...note, startBeat: -1 }],
      [{ ...note, lengthBeats: 0 }],
      [{ ...note, velocity: 128 }],
      [{ ...note, velocity: 0.5 }],
      [note, note],
    ]) {
      expect(
        parseClipClipboard(
          JSON.stringify({
            ...payload,
            patterns: [{ ...sharedPattern, notes }],
          })
        )
      ).toBeNull()
    }
    expect(
      parseClipClipboard(
        JSON.stringify({
          ...payload,
          items: [{ trackOffset: 0, barOffset: 0, clip: { ...patternClip, patternId: "missing" } }],
        })
      )
    ).toBeNull()
  })
})
