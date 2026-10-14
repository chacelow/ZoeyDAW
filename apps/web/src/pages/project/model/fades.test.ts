// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { hydrateProject, projectActions, serializeProject, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"
import { parseProject } from "./persistence"
import type { AudioClip } from "./types"

function clip(): AudioClip {
  const found = useProjectState.getState().document.tracks.find(track => track.id === "3-audio")
    ?.clips[0]
  if (found?.kind !== "audio") {
    throw new Error("Expected audio fixture")
  }
  return found
}

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

describe("audio fade editing", () => {
  it("roundtrips independently bent curves, and retains them across duplicate and split", () => {
    const curves = {
      fadeInCurve: -0.8,
      fadeOutCurve: 0.7,
      fadeInCurvePosition: 0.2,
      fadeOutCurvePosition: 0.8,
    }
    projectActions.updateClip(clip().id, curves)
    const saved = serializeProject()
    hydrateProject(saved)
    expect(clip()).toMatchObject(curves)
    const { id } = clip()
    projectActions.duplicateClips([id])
    const copy = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")
      ?.clips.find(item => item.id !== id)
    expect(copy).toMatchObject(curves)
    projectActions.splitClips([id], clip().startBar + clip().lengthBars / 2)
    const pieces = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")
      ?.clips.filter(item => item.id !== copy?.id)
    expect(pieces).toHaveLength(2)
    if (pieces != null) {
      for (const piece of pieces) {
        expect(piece).toMatchObject(curves)
      }
    }
  })

  it("bounds fade lengths against each other and curves against the persisted interval", () => {
    const { id } = clip()
    projectActions.updateClip(id, { fadeInBars: 999, fadeInCurve: 999, fadeInCurvePosition: 999 })
    expect(clip().fadeInBars).toBe(clip().lengthBars - (clip().fadeOutBars ?? 0))
    expect(clip().fadeInCurve).toBe(1)
    expect(clip().fadeInCurvePosition).toBe(0.9)
    projectActions.updateClip(id, {
      fadeOutBars: -10,
      fadeOutCurve: -999,
      fadeOutCurvePosition: -999,
    })
    expect(clip().fadeOutBars).toBe(0)
    expect(clip().fadeOutCurve).toBe(-1)
    expect(clip().fadeOutCurvePosition).toBe(0.1)
    projectActions.updateClip(id, { fadeInBars: -10 })
    expect(clip().fadeInBars).toBe(0)
    projectActions.updateClip(id, { fadeInCurve: NaN, fadeInCurvePosition: NaN })
    expect(clip().fadeInCurve).toBe(1)
    expect(clip().fadeInCurvePosition).toBe(0.9)
    projectActions.updateClip(id, { fadeInBars: 20, fadeOutBars: 20 })
    expect(clip().fadeInBars).toBe(clip().lengthBars)
    expect(clip().fadeOutBars).toBe(0)
    expect(() => parseProject(serializeProject())).not.toThrow()
  })

  it("retains curve metadata while trims keep fades within the visible source window", () => {
    const original = clip()
    projectActions.updateClip(original.id, {
      fadeInBars: 4,
      fadeOutBars: 3,
      fadeInCurve: 0.9,
      fadeOutCurve: -0.7,
    })
    projectActions.resizeClip(original.id, "left", original.startBar + 3)
    projectActions.resizeClip(original.id, "right", clip().startBar + 1)
    expect(clip()).toMatchObject({ fadeInCurve: 0.9, fadeOutCurve: -0.7 })
    expect(clip().sourceOffsetBars).toBe(3)
    expect((clip().fadeInBars ?? 0) + (clip().fadeOutBars ?? 0)).toBeLessThanOrEqual(
      clip().lengthBars
    )
    expect(() => serializeProject()).not.toThrow()
  })

  it("groups a length and curve gesture into one undo entry and restores cancellation", () => {
    const before = { ...clip() }
    projectActions.beginEdit()
    projectActions.updateClip(before.id, { fadeInBars: 1 })
    projectActions.updateClip(before.id, { fadeInCurve: 0.6 })
    projectActions.endEdit()
    expect(clip()).toMatchObject({ fadeInBars: 1, fadeInCurve: 0.6 })
    projectActions.undo()
    expect(clip()).toEqual(before)
    projectActions.redo()
    projectActions.beginEdit()
    projectActions.updateClip(before.id, { fadeOutBars: 0.1, fadeOutCurve: -0.5 })
    projectActions.cancelEdit()
    expect(clip()).toMatchObject({
      fadeInBars: 1,
      fadeInCurve: 0.6,
      fadeOutBars: before.fadeOutBars,
    })
    expect(clip().fadeOutCurve).toBeUndefined()
  })

  it("persists inward boundaries and rejects overlapping or malformed offsets", () => {
    const { id } = clip()
    projectActions.updateClip(id, {
      fadeInOffsetBars: 1,
      fadeInBars: 2,
      fadeOutOffsetBars: 1.5,
      fadeOutBars: 3,
    })
    const saved = serializeProject()
    hydrateProject(saved)
    expect(clip()).toMatchObject({
      fadeInOffsetBars: 1,
      fadeInBars: 2,
      fadeOutOffsetBars: 1.5,
      fadeOutBars: 3,
    })
    projectActions.updateClip(id, { fadeInOffsetBars: 999 })
    expect(
      (clip().fadeInOffsetBars ?? 0) +
        (clip().fadeInBars ?? 0) +
        (clip().fadeOutOffsetBars ?? 0) +
        (clip().fadeOutBars ?? 0)
    ).toBeLessThanOrEqual(clip().lengthBars)
    for (const bad of [-1, "2", null, Number.MAX_VALUE]) {
      const document = createMockDocument()
      const candidate = document.tracks.find(track => track.id === "3-audio")?.clips[0]
      if (candidate?.kind !== "audio") {
        throw new Error("Expected audio fixture")
      }
      Object.assign(candidate, { fadeOutOffsetBars: bad })
      expect(() =>
        parseProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
      ).toThrow()
    }
  })

  it("rejects malformed curves at the snapshot boundary", () => {
    for (const value of [-1.01, 1.01, "0.5", null]) {
      const document = createMockDocument()
      const candidate = document.tracks.find(track => track.id === "3-audio")?.clips[0]
      if (candidate?.kind !== "audio") {
        throw new Error("Expected audio fixture")
      }
      Object.assign(candidate, { fadeOutCurve: value })
      expect(() =>
        parseProject(
          JSON.stringify({
            version: 2,
            document,
            workspace: createMockWorkspace(),
          })
        )
      ).toThrow()
    }
  })

  it.each(["fadeInCurvePosition", "fadeOutCurvePosition"])(
    "rejects malformed horizontal anchor positions in %s at the snapshot boundary",
    field => {
      for (const value of [0.09, 0.91, "0.5", null]) {
        const document = createMockDocument()
        const candidate = document.tracks.find(track => track.id === "3-audio")?.clips[0]
        Object.assign(candidate!, { [field]: value })
        expect(() =>
          parseProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
        ).toThrow()
      }
    }
  )
})
