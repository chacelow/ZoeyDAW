import { beforeEach, describe, expect, it } from "bun:test"
import { hydrateProject, projectActions, serializeProject, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace, mockWaveformPeaks } from "../adapters/fixtures"
import { visibleTracks } from "./types"
import type { DocumentState } from "./types"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

describe("snapshot graph and identity boundaries", () => {
  it("promotes nested children into their parent's ordered membership when ungrouping", () => {
    projectActions.addTrack("group")
    const parentId = useProjectState
      .getState()
      .document.tracks.find(track => track.kind === "group" && track.id !== "drums-group")!.id
    projectActions.updateTrack("drums-group", { output: parentId })
    projectActions.updateTrack("4-midi", { output: parentId })
    projectActions.ungroupTrack("drums-group")

    const { tracks } = useProjectState.getState().document
    const parent = tracks.find(track => track.id === parentId)!
    expect(parent.childTrackIds).toEqual(["trager", "sidechain", "4-midi"])
    expect(tracks.find(track => track.id === "trager")?.output).toBe(parentId)
    expect(tracks.find(track => track.id === "sidechain")?.output).toBe(parentId)
    expect(tracks.find(track => track.id === "4-midi")?.output).toBe(parentId)

    projectActions.updateTrack(parentId, { collapsed: true })
    const shown = visibleTracks(useProjectState.getState().document.tracks).map(track => track.id)
    for (const id of ["trager", "sidechain", "4-midi"]) {
      expect(shown).not.toContain(id)
    }
    const saved = serializeProject()
    hydrateProject(saved)
    const restored = useProjectState.getState().document.tracks
    expect(restored.find(track => track.id === parentId)?.childTrackIds).toEqual([
      "trager",
      "sidechain",
      "4-midi",
    ])
    const shownAfterRestore = visibleTracks(restored).map(track => track.id)
    for (const id of ["trager", "sidechain", "4-midi"]) {
      expect(shownAfterRestore).not.toContain(id)
    }
  })

  const malformed: [string, (document: DocumentState) => void][] = [
    [
      "a route to an ordinary track",
      document => {
        document.tracks.find(track => track.id === "3-audio")!.output = "4-midi"
      },
    ],
    [
      "an unlisted child routed to a group",
      document => {
        document.tracks.find(track => track.id === "drums-group")!.childTrackIds = ["sidechain"]
      },
    ],
    [
      "a listed child routed elsewhere",
      document => {
        document.tracks.find(track => track.id === "trager")!.output = "main"
      },
    ],
    [
      "overflowing timeline clip window",
      document => {
        const clip = document.tracks.find(track => track.id === "3-audio")!.clips[0]
        clip.startBar = Number.MAX_VALUE
        clip.lengthBars = Number.MAX_VALUE
      },
    ],
    [
      "overflowing retained source window",
      document => {
        const clip = document.tracks.find(track => track.id === "3-audio")!.clips[0]
        clip.sourceOffsetBars = Number.MAX_VALUE
        clip.lengthBars = Number.MAX_VALUE
      },
    ],
    [
      "overlapping audio fades",
      document => {
        const clip = document.tracks.find(track => track.id === "3-audio")!.clips[0]
        if (clip.kind !== "audio") {
          throw new Error("Expected audio fixture")
        }
        clip.fadeInBars = 9
        clip.fadeOutBars = 9
      },
    ],
    [
      "duplicate markers",
      document => {
        document.markers.push({ ...document.markers[0] })
      },
    ],
    [
      "duplicate automation lanes on one track",
      document => {
        const track = document.tracks.find(track => track.id === "3-audio")!
        track.automation.push(structuredClone(track.automation[0]))
      },
    ],
    [
      "duplicate points within a lane",
      document => {
        const { points } = document.tracks.find(track => track.id === "3-audio")!.automation[0]
        points.push({ ...points[0] })
      },
    ],
    [
      "duplicate provided MIDI note IDs within a clip",
      document => {
        const clip = document.tracks.find(track => track.id === "trager")!.clips[0]
        if (clip.kind !== "midi") {
          throw new Error("Expected MIDI fixture")
        }
        clip.notes.push({ ...clip.notes[0] })
      },
    ],
  ]

  it.each(malformed)("rejects %s atomically without clearing undo history", (_label, corrupt) => {
    projectActions.setBpm(130)
    const before = serializeProject()
    const document = structuredClone(useProjectState.getState().document)
    corrupt(document)
    expect(() =>
      hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
    ).toThrow()
    expect(serializeProject()).toBe(before)
    expect(useProjectState.getState().session.canUndo).toBe(true)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  })
})

describe("source windows and waveform fixtures", () => {
  it("preserves a long source window's authored musical range", () => {
    const document = createMockDocument()
    const clip = document.tracks.find(track => track.id === "3-audio")!.clips[0]
    clip.lengthBars = 10_000
    clip.sourceOffsetBars = 0.5
    hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
    const restored = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!.clips[0]
    expect(restored.lengthBars).toBe(10_000)
    expect(restored.sourceOffsetBars).toBe(0.5)
    expect(serializeProject()).not.toContain("waveformPeaks")
  })

  it("samples the full long span and wraps to the authored waveform period", () => {
    const peaks = mockWaveformPeaks("mock://kick.wav", 0.5, 10_000)!
    expect(peaks).toHaveLength(2048)
    expect(peaks[0]).toBeCloseTo(0.4 + 0.4 * Math.abs(Math.sin((2 * Math.PI * 0.5 * 7) / 16)))
    const middleBar = (0.5 + 5000) % 16
    expect(peaks[1024]).toBeCloseTo(
      0.4 + 0.4 * Math.abs(Math.sin((2 * Math.PI * middleBar * 7) / 16))
    )
  })

  it("never generates NaN from a huge but finite source window or offset", () => {
    for (const samplePath of ["mock://kick.wav", "mock://untitled.wav"]) {
      const peaks = mockWaveformPeaks(samplePath, Number.MAX_VALUE, Number.MAX_VALUE)!
      expect(peaks).toHaveLength(2048)
      expect(peaks.every(peak => Number.isFinite(peak) && peak >= 0 && peak <= 1)).toBe(true)
    }
  })
})
