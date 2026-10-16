import { beforeEach, describe, expect, it } from "bun:test"
import { hydrateProject, projectActions, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace, TEST_CREATION } from "../adapters/fixtures"
import { moveClipAutomation } from "./clip-automation"
import { createTrack } from "./reducers"
import type { Track } from "./types"

const audio = (tracks: readonly Track[]) => tracks.find(track => track.id === "3-audio")!
const points = (track: Track, parameter: "volume" | "pan" = "volume") =>
  track.automation.find(lane => lane.parameter === parameter)!.points

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

describe("automation accompanying Clip moves", () => {
  it("uses half-open source intervals, preserves identity and curves, and lets moved points win collisions", () => {
    const source = createMockDocument().tracks
    const original = audio(source)
    original.automation[0].points = [
      { id: "start", bar: 1, value: 0.3, curve: -0.25 },
      { id: "inside", bar: 9, value: 0.7 },
      { id: "end", bar: 17, value: 0.9 },
      { id: "collision", bar: 21, value: 0.1 },
    ]
    const result = moveClipAutomation(
      source,
      source,
      new Set(["audio-1"]),
      new Map([["3-audio", "3-audio"]]),
      12,
      false
    )
    expect(points(audio(result))).toEqual([
      { id: "start", bar: 13, value: 0.3, curve: -0.25 },
      { id: "end", bar: 17, value: 0.9 },
      { id: "inside", bar: 21, value: 0.7 },
    ])
    expect(points(original)[0]).toEqual({ id: "start", bar: 1, value: 0.3, curve: -0.25 })
    expect(points(audio(result), "pan")).toEqual([
      { id: "pan-left", bar: 13, value: 0.25 },
      { id: "pan-right", bar: 17, value: 0.75 },
    ])
  })

  it("moves a shared breakpoint once when selected Clips overlap", () => {
    const source = createMockDocument().tracks
    audio(source).clips.push({
      id: "overlap",
      kind: "audio",
      startBar: 8,
      lengthBars: 8,
      samplePath: "mock://kick.wav",
      gainDb: 0,
    })
    const result = moveClipAutomation(
      source,
      source,
      new Set(["audio-1", "overlap"]),
      new Map([["3-audio", "3-audio"]]),
      4,
      false
    )
    expect(points(audio(result)).map(point => [point.id, point.bar])).toEqual([
      ["fade-up", 5],
      ["peak", 13],
      ["tail", 17],
    ])
  })

  it("matches destination parameters, creates missing lanes, and copies fresh point IDs without removing sources", () => {
    const source = createMockDocument().tracks
    const target = createTrack("audio", source, undefined, TEST_CREATION)
    target.id = "other-audio"
    target.automation = [
      {
        id: "other-volume",
        parameter: "volume",
        points: [{ id: "resident", bar: 5, value: 0.1 }],
      },
    ]
    source.push(target)
    const moved = moveClipAutomation(
      source,
      source,
      new Set(["audio-1"]),
      new Map([["3-audio", target.id]]),
      4,
      true
    )
    const destination = moved.find(track => track.id === target.id)!
    expect(points(audio(moved))).toEqual(points(audio(source)))
    expect(points(destination).map(point => [point.bar, point.value])).toEqual([
      [5, 0.35],
      [13, 0.85],
    ])
    expect(points(destination).map(point => point.id)).not.toContain("fade-up")
    expect(points(destination)[0].id).not.toBe("resident")
    expect(points(destination, "pan")).toEqual([{ id: expect.any(String), bar: 5, value: 0.25 }])
    const sourceIds = new Set(
      audio(source).automation.flatMap(lane => lane.points.map(point => point.id))
    )
    expect(
      destination.automation.flatMap(lane => lane.points).every(point => !sourceIds.has(point.id))
    ).toBe(true)
    expect(target.automation).toHaveLength(1)
  })

  it("moves matching lanes across tracks while leaving unrelated destination automation untouched", () => {
    const source = createMockDocument().tracks
    const target = createTrack("audio", source, undefined, TEST_CREATION)
    target.id = "other-audio"
    target.automation = [
      { id: "other-pan", parameter: "pan", points: [{ id: "pan-resident", bar: 24, value: 0.8 }] },
    ]

    source.push(target)
    const result = moveClipAutomation(
      source,
      source,
      new Set(["audio-1"]),
      new Map([["3-audio", target.id]]),
      3,
      false
    )
    expect(points(audio(result))).toEqual([{ id: "tail", bar: 17, value: 0.5 }])
    expect(points(result.find(track => track.id === target.id)!)).toEqual([
      { id: "fade-up", bar: 4, value: 0.35 },
      { id: "peak", bar: 12, value: 0.85 },
    ])
    expect(
      points(
        result.find(track => track.id === target.id)!,
        "pan"
      )
    ).toEqual([
      { id: "pan-left", bar: 4, value: 0.25 },
      { id: "pan-resident", bar: 24, value: 0.8 },
    ])
  })

  it("copies Clip and automation together with fresh IDs and undoes the copy in one step", () => {
    const document = createMockDocument()
    const workspace = { ...createMockWorkspace(), automationMode: true }
    hydrateProject(JSON.stringify({ version: 2, document, workspace }))
    projectActions.moveClips(["audio-1"], "3-audio", 2, true)
    const current = audio(useProjectState.getState().document.tracks)
    expect(current.clips).toHaveLength(2)
    expect(current.clips[1].id).not.toBe("audio-1")
    expect(current.clips[1].startBar).toBe(3)
    expect(points(current).map(point => [point.id, point.bar])).toEqual([
      ["fade-up", 1],
      [expect.any(String), 3],
      ["peak", 9],
      [expect.any(String), 11],
      ["tail", 17],
    ])
    expect(points(current)[1].id).not.toBe("fade-up")
    expect(points(current)[3].id).not.toBe("peak")
    projectActions.undo()
    const restored = audio(useProjectState.getState().document.tracks)
    expect(restored.clips).toHaveLength(1)
    expect(points(restored)).toEqual(points(audio(document.tracks)))
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })

  it("does not move automation while Automation mode is off", () => {
    projectActions.moveClips(["audio-1"], "3-audio", 2)
    const current = audio(useProjectState.getState().document.tracks)
    expect(current.clips[0].startBar).toBe(3)
    expect(points(current)).toEqual(points(audio(createMockDocument().tracks)))
  })

  it("shares the left-edge clamp with Clips and commits both in one undoable document change", () => {
    const document = createMockDocument()
    const lane = audio(document.tracks)
    lane.clips[0].startBar = 4
    lane.automation[0].points = [
      { id: "head", bar: 4, value: 0.25 },
      { id: "end", bar: 20, value: 0.5 },
    ]
    const workspace = { ...createMockWorkspace(), automationMode: true }
    hydrateProject(JSON.stringify({ version: 2, document, workspace }))
    projectActions.moveClips(["audio-1"], "3-audio", -8)
    const after = audio(useProjectState.getState().document.tracks)
    expect(after.clips[0].startBar).toBe(1)
    expect(points(after)).toEqual([
      { id: "head", bar: 1, value: 0.25 },
      { id: "end", bar: 20, value: 0.5 },
    ])
    projectActions.undo()
    const restored = audio(useProjectState.getState().document.tracks)
    expect(restored.clips[0].startBar).toBe(4)
    expect(points(restored)).toEqual(points(lane))
    expect(useProjectState.getState().session.canUndo).toBe(false)
    projectActions.redo()
    expect(points(audio(useProjectState.getState().document.tracks))[0].bar).toBe(1)
  })
})
