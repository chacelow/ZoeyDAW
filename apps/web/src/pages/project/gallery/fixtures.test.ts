import { describe, expect, it } from "vitest"
import labels from "@/locales/gallery-project.en-US"
import { parseProject, stringifyProject } from "@zoeydaw/project-core/persistence"
import { acceptsClip } from "@zoeydaw/project-core/types"
import { projectTrackGroups } from "@zoeydaw/project-core/track-groups"
import { createGallerySeed, parsePreviewKind, PREVIEW_KINDS } from "./fixtures"
import { findMediaSource } from "@zoeydaw/project-core/media"

describe("isolated Gallery fixture boundary", () => {
  it("admits only the finite preview families and falls back to Tracks", () => {
    for (const kind of PREVIEW_KINDS) expect(parsePreviewKind(kind)).toBe(kind)
    for (const kind of [undefined, "", "project", "../project/real", "AUDIO"])
      expect(parsePreviewKind(kind)).toBe("tracks")
  })

  it.each(PREVIEW_KINDS)("authors a valid, deterministic in-memory %s seed", kind => {
    const seed = createGallerySeed(kind, labels.fixtures)
    expect(seed).toEqual(createGallerySeed(kind, labels.fixtures))
    const parsed = parseProject(stringifyProject(seed.document, seed.workspace))
    expect(parsed.document.tracks).toHaveLength(9)
    expect(new Set(parsed.document.tracks.map(track => track.kind))).toEqual(
      new Set(["audio", "midi", "group", "return", "main"])
    )
    expect(
      parsed.document.tracks
        .flatMap(track => track.clips.map(clip => acceptsClip(track.kind, clip.kind)))
        .every(Boolean)
    ).toBe(true)
    const clips = parsed.document.tracks.flatMap(track => track.clips)
    expect(new Set(clips.map(clip => clip.kind))).toEqual(new Set(["audio", "midi", "pattern"]))
    for (const clip of seed.document.tracks.flatMap(track => track.clips)) {
      if (clip.kind === "audio") {
        if (clip.id === "gallery-audio-empty") {
          expect(clip.sourceId).toBeNull()
          expect(clip.waveformPeaks).toBeUndefined()
        } else {
          expect(findMediaSource(seed.document.media, clip.sourceId)?.location.kind).toBe("fixture")
          expect(clip.waveformPeaks?.length).toBeGreaterThan(0)
        }
      }
    }
    expect(clips.find(clip => clip.id === "gallery-midi-empty")).toMatchObject({
      kind: "midi",
      notes: [],
    })
    const emptyPattern = clips.find(clip => clip.id === "gallery-pattern-empty")
    if (emptyPattern?.kind !== "pattern") throw new Error("Missing Pattern fixture")
    expect(
      seed.document.patterns.find(pattern => pattern.id === emptyPattern.patternId)?.notes
    ).toEqual([])
    expect(clips.find(clip => clip.id === "gallery-audio-override")).toMatchObject({
      kind: "audio",
      fadeInBars: 0,
      fadeOutBars: 0,
      audioSettings: { warp: false, reverse: true },
    })
    const groups = seed.document.tracks.filter(track => track.kind === "group")
    expect(groups).toHaveLength(3)
    expect(groups.find(track => track.id === "ensemble")?.childTrackIds).toContain("drums")
    expect(groups.find(track => track.id === "synths")?.childTrackIds).toEqual(["gallery-midi"])
    const projection = projectTrackGroups(seed.document.tracks)
    expect(projection.railsByTrackId.get("gallery-pattern")?.map(rail => rail.group.id)).toEqual([
      "ensemble",
      "drums",
    ])
    expect(projection.leafDescendantsByGroupId.get("ensemble")?.map(track => track.id)).toEqual([
      "gallery-pattern",
      "gallery-audio",
    ])
  })

  it("does not share mutable authored arrays between frames or resets", () => {
    const first = createGallerySeed("tracks", labels.fixtures)
    const second = createGallerySeed("tracks", labels.fixtures)
    first.document.tracks[0]?.childTrackIds?.push("outside")
    expect(second.document.tracks[0]?.childTrackIds).not.toContain("outside")
    expect(first.workspace.automationMode).toBe(false)
    expect(createGallerySeed("automation", labels.fixtures).workspace.automationMode).toBe(true)
  })
})
