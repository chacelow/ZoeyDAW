// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import {
  hydrateProject,
  projectActions,
  useProjectState,
  serializeProject,
} from "@/pages/project/adapters"
import { locateClip } from "@zoeydaw/project-core/clip-content"
import { parseProject } from "@zoeydaw/project-core/persistence"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { FooterPanel } from "../FooterPanel"

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const midi = document.tracks.find(track => track.kind === "midi")
  if (!midi) throw new Error("Missing MIDI fixture")
  document.patterns.push({
    id: "session-shared-pattern",
    notes: [{ id: "original-note", pitch: 60, startBeat: 0, lengthBeats: 0.5, velocity: 90 }],
    loopBars: 1,
  })
  midi.clips.push({
    id: "session-pattern-source",
    kind: "pattern",
    patternId: "session-shared-pattern",
    startBar: 40,
    lengthBars: 1,
  })
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("edits a Session clip in the existing editor without changing the Arrangement source", () => {
  const initial = useProjectState.getState().document
  const owner = initial.tracks.find(track => track.kind === "audio" && track.clips.length)
  if (!owner) throw new Error("Missing audio fixture")
  const source = owner.clips[0]
  const before = structuredClone(source)
  act(() => {
    projectActions.addScene("Verse")
    const scene = useProjectState.getState().document.launcher.scenes[0]
    projectActions.copyClipToSlot(source.id, owner.id, scene.id)
    projectActions.selectClipSlot(owner.id, scene.id)
  })
  const slotId = useProjectState.getState().session.editingClipId
  const view = render(<FooterPanel view="clip" />)
  const name = view.container.querySelector<HTMLInputElement>("[data-clip-name]")
  if (!name || !slotId) throw new Error("Session selection did not open shared editor")
  fireEvent.focus(name)
  fireEvent.change(name, { target: { value: "Independent Session take" } })
  fireEvent.blur(name)
  expect(locateClip(useProjectState.getState().document.tracks, slotId)?.clip.label).toBe(
    "Independent Session take"
  )
  expect(locateClip(useProjectState.getState().document.tracks, source.id)?.clip).toEqual(before)
  act(() => projectActions.undo())
  expect(view.container.querySelector<HTMLInputElement>("[data-clip-name]")?.value).not.toBe(
    "Independent Session take"
  )
  act(() => projectActions.redo())
  expect(view.container.querySelector<HTMLInputElement>("[data-clip-name]")?.value).toBe(
    "Independent Session take"
  )
  const restored = parseProject(serializeProject()).document
  expect(locateClip(restored.tracks, slotId)?.clip.label).toBe("Independent Session take")
  expect(locateClip(restored.tracks, slotId)?.clip).not.toHaveProperty("startBar")
  act(() => projectActions.deleteClips([slotId]))
  expect(locateClip(useProjectState.getState().document.tracks, slotId)).toBeNull()
  expect(locateClip(useProjectState.getState().document.tracks, source.id)?.clip).toEqual(before)
  act(() => projectActions.undo())
  expect(view.container.querySelector<HTMLInputElement>("[data-clip-name]")?.value).toBe(
    "Independent Session take"
  )
})

it("keeps shared Pattern notes editable across Session and Arrangement, including undo", () => {
  const initial = useProjectState.getState().document
  const owner = initial.tracks.find(track =>
    track.clips.some(clip => clip.id === "session-pattern-source")
  )
  const source = owner?.clips.find(clip => clip.id === "session-pattern-source")
  if (!owner || source?.kind !== "pattern") throw new Error("Missing Pattern fixture")
  const original = structuredClone(
    initial.patterns.find(pattern => pattern.id === source.patternId)?.notes
  )
  act(() => {
    projectActions.addScene("Pattern scene")
    const scene = useProjectState.getState().document.launcher.scenes[0]
    projectActions.copyClipToSlot(source.id, owner.id, scene.id)
    projectActions.selectClipSlot(owner.id, scene.id)
  })
  const slotId = useProjectState.getState().session.editingClipId
  if (!slotId) throw new Error("Missing Pattern slot")
  const view = render(<FooterPanel view="clip" />)
  expect(view.container.querySelector("[data-midi-editor]")).not.toBeNull()
  const notes = [{ id: "session-note", pitch: 67, startBeat: 0.5, lengthBeats: 1, velocity: 105 }]
  act(() => projectActions.updateClip(slotId, { notes }))
  expect(
    useProjectState.getState().document.patterns.find(pattern => pattern.id === source.patternId)
      ?.notes
  ).toEqual(notes)
  expect(locateClip(useProjectState.getState().document.tracks, source.id)?.clip).toEqual(source)
  act(() => projectActions.undo())
  expect(
    useProjectState.getState().document.patterns.find(pattern => pattern.id === source.patternId)
      ?.notes
  ).toEqual(original)
  expect(view.container.querySelector("[data-midi-editor]")).not.toBeNull()
})
