import { describe, expect, it } from "vitest"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"
import { mockMeterLevels } from "../adapters/mockMeters"
import type { ProjectState } from "./types"
import { initialSession } from "../stores/slices/session"

function mockState(): ProjectState {
  return {
    document: createMockDocument(),
    workspace: createMockWorkspace(),
    session: { ...initialSession(), playing: true },
  }
}

describe("mock meter routing", () => {
  it("responds to gain/pan and routes audio into main only while a clip is active", () => {
    const state = mockState()
    state.document.tracks.find(track => track.id === "sidechain")!.solo = false
    const audio = state.document.tracks.find(track => track.id === "3-audio")!
    audio.automation = []
    const initial = mockMeterLevels(state, 1, 1000)
    expect(initial[audio.id][0]).toBeGreaterThan(-60)
    expect(initial.main[0]).toBeGreaterThan(-60)
    audio.pan = 1
    audio.volumeDb = -30
    const changed = mockMeterLevels(state, 1, 1000)
    expect(changed[audio.id][0]).toBe(-60)
    expect(changed[audio.id][1]).toBeLessThan(initial[audio.id][1])
    expect(mockMeterLevels(state, 100, 1000)[audio.id]).toEqual([-60, -60])
  })

  it("uses the same curved envelope to vary visual meter gain and pan without changing track controls", () => {
    const state = mockState()
    state.document.tracks.find(track => track.id === "sidechain")!.solo = false
    const audio = state.document.tracks.find(track => track.id === "3-audio")!
    audio.automation = [
      {
        id: "gain",
        parameter: "volume",
        points: [
          { id: "a", bar: 1, value: 0.2, curve: -0.8 },
          { id: "b", bar: 5, value: 1 },
        ],
      },
      {
        id: "pan",
        parameter: "pan",
        points: [
          { id: "p", bar: 1, value: 0.5 },
          { id: "r", bar: 5, value: 1 },
        ],
      },
    ]
    const first = mockMeterLevels(state, 1, 1000)[audio.id]
    const midpoint = mockMeterLevels(state, 3, 1000)[audio.id]
    expect(midpoint[1]).toBeGreaterThan(first[1])
    expect(midpoint[0]).toBeLessThan(midpoint[1])
    expect(audio.volumeDb).toBe(-7.1)
    expect(audio.pan).toBe(-0.25)
  })

  it("includes soloed child through its group and excludes non-solo tracks", () => {
    const state = mockState()
    const group = state.document.tracks.find(track => track.id === "drums-group")!
    state.document.tracks.find(track => track.id === "sidechain")!.solo = false
    const child = state.document.tracks.find(track => track.id === "trager")!
    child.solo = true
    state.session.activeMidiNotes = [60]
    state.session.playing = false
    const levels = mockMeterLevels(state, 1, 1000)
    expect(levels[child.id][0]).toBeGreaterThan(-60)
    expect(levels[group.id][0]).toBeGreaterThan(-60)
    expect(levels.main[0]).toBeGreaterThan(-60)
  })
})
