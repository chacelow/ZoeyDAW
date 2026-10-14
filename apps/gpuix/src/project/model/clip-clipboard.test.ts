import { describe, expect, it } from "bun:test"
import { createMockDocument } from "../adapters/fixtures"
import { collectClips, parseClipClipboard } from "./clip-clipboard"

const document = createMockDocument()

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
    const encoded = collectClips(tracks, [source.id, note.id])
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
    })
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
    const encoded = collectClips(tracks, [candidate.id], {
      startBar: 3,
      endBar: 10,
      trackIds: [audio.id],
    })
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
    const sample = collectClips(document.tracks, ["audio-1"])
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
      parseClipClipboard(JSON.stringify({ ...sample, items: [sample.items[0], sample.items[0]] }))
    ).toBeNull()
    expect(parseClipClipboard("{not-json")).toBeNull()
  })
})
