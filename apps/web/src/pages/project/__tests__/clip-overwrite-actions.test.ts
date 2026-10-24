import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import type { AudioClip } from "@zoeydaw/project-core/types"

it.each(["move", "copy", "resize", "update", "create", "paste", "duplicate"])(
  "%s overwrites target intervals in a single reversible clip edit",
  operation => {
    const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
    const target = document.tracks.find(track => track.kind === "audio")!
    const source: AudioClip = {
      id: "source",
      kind: "audio",
      sourceId: null,
      gainDb: 0,
      startBar: 20,
      lengthBars: 3,
    }
    const destination: AudioClip = {
      ...source,
      id: "destination",
      startBar: 1,
      lengthBars: 12,
      sourceOffsetBars: -2,
    }
    target.clips = [destination, source]
    if (operation === "duplicate") {
      source.startBar = 1
      destination.startBar = 4
    }
    hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
    const before = useProjectState.getState().document
    switch (operation) {
      case "move":
        projectActions.moveClips([source.id], target.id, -15)
        break
      case "copy":
        projectActions.moveClips([source.id], target.id, -15, true)
        break
      case "resize":
        projectActions.resizeClip(source.id, "left", 5)
        break
      case "update":
        projectActions.updateClip(source.id, { startBar: 5 })
        break
      case "create":
        projectActions.createClip(target.id, "audio", 5, 3)
        break
      case "paste":
        projectActions.copyClips([source.id])
        projectActions.pasteClips(target.id, 5)
        break
      case "duplicate":
        projectActions.duplicateClips([source.id])
        break
    }
    const after = useProjectState.getState().document
    const clips = [...after.tracks.find(track => track.id === target.id)!.clips].sort(
      (a, b) => a.startBar - b.startBar
    )
    for (let index = 1; index < clips.length; index++) {
      expect(clips[index - 1].startBar + clips[index - 1].lengthBars).toBeLessThanOrEqual(
        clips[index].startBar
      )
    }
    projectActions.undo()
    expect(useProjectState.getState().document).toBe(before)
    expect(useProjectState.getState().session.canUndo).toBe(false)
    projectActions.redo()
    expect(useProjectState.getState().document).toBe(after)
  }
)

it("does not normalize legacy overlaps when changing gain or fades only", () => {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(track => track.kind === "audio")!
  const clip = track.clips[0]
  if (clip.kind !== "audio") throw new Error("Missing audio fixture")
  track.clips.push({ ...clip, id: "overlapping" })
  hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
  projectActions.updateClip(clip.id, { gainDb: -6, fadeInBars: 0.25 })
  expect(
    useProjectState.getState().document.tracks.find(item => item.id === track.id)?.clips
  ).toHaveLength(2)
})

it("duplicates a differently-sized selection with one shared time transform and Automation points", () => {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(track => track.kind === "audio")!
  const first: AudioClip = {
    id: "first",
    kind: "audio",
    sourceId: null,
    gainDb: 0,
    startBar: 1,
    lengthBars: 2,
  }
  const second: AudioClip = { ...first, id: "second", startBar: 5, lengthBars: 3 }
  track.clips = [first, second]
  track.automation = [
    {
      id: "volume",
      target: { kind: "mixer", parameter: "volume" },
      points: [{ id: "point", bar: 2, value: 0.5 }],
    },
  ]
  hydrateProject(
    JSON.stringify({
      version: 3,
      document,
      workspace: { ...createMockWorkspace(), automationMode: true },
    })
  )
  projectActions.duplicateClips([first.id, second.id])
  const current = useProjectState.getState()
  const copies = current.document.tracks.find(item => item.id === track.id)!
  expect(
    copies.clips
      .filter(clip => current.session.selectedClipIds.includes(clip.id))
      .map(clip => clip.startBar)
  ).toEqual([8, 12])
  expect(copies.automation[0].points.map(point => point.bar)).toEqual([2, 9])
})
