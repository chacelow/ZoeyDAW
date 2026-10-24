// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import labels from "@/locales/gallery-project.en-US"
import { projectActions, useProjectState } from "../adapters"
import { hydrateState } from "../adapters/context"
import { ClipDetail } from "../sections/ArrangementPanel/Clip/Detail"
import { createGallerySeed } from "./fixtures"
import { useGalleryEditorSelection } from "./useGalleryEditorSelection"

function SelectedEditor({ open = true }: { readonly open?: boolean }) {
  useGalleryEditorSelection("track-editor", open)
  const clip = useProjectState(state =>
    state.document.tracks
      .flatMap(track => track.clips)
      .find(item => item.id === state.session.editingClipId)
  )
  return open && clip ? <ClipDetail clip={clip} /> : null
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  hydrateState(createGallerySeed("track-editor", labels.fixtures))
  projectActions.selectTracks(["gallery-audio"], "header")
  projectActions.setEditingClip("gallery-audio-clip")
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("follows header track selection with one correct source editor, live title and owner color", () => {
  const view = render(<SelectedEditor />)
  expect(view.container.querySelector(".audio-detail-source-surface")).not.toBeNull()
  act(() => projectActions.selectTracks(["gallery-midi"], "header"))
  expect(useProjectState.getState().session.editingClipId).toBe("gallery-midi-clip")
  expect(view.container.querySelectorAll("[data-midi-editor]")).toHaveLength(1)
  expect(view.container.querySelector(".audio-detail-source-surface")).toBeNull()
  expect(view.container.querySelector<HTMLInputElement>("[data-clip-name]")?.value).toBe(
    labels.fixtures.midi
  )
  expect(
    view.container.querySelector("[data-clip-editor-titlebar]")?.getAttribute("data-title-color")
  ).toBe("var(--chart-5)")
  act(() => projectActions.selectTracks(["gallery-pattern"], "header"))
  expect(view.container.querySelectorAll("[data-midi-editor]")).toHaveLength(1)
  act(() =>
    projectActions.updateClip("gallery-pattern-clip", {
      label: "Renamed rhythm",
      color: "var(--chart-4)",
    })
  )
  expect(view.container.querySelector<HTMLInputElement>("[data-clip-name]")?.value).toBe(
    "Renamed rhythm"
  )
  expect(
    view.container.querySelector("[data-clip-editor-titlebar]")?.getAttribute("data-title-color")
  ).toBe("var(--chart-4)")
  act(() => projectActions.selectTracks(["main"], "header"))
  expect(view.container.querySelector("[data-clip-editor]")).toBeNull()
})

it("follows another selected clip without replacing it with the first clip on its track", () => {
  const view = render(<SelectedEditor />)
  act(() => projectActions.selectClips(["gallery-audio-override"]))
  expect(useProjectState.getState().session.editingClipId).toBe("gallery-audio-override")
  expect(
    view.container.querySelector("[data-clip-editor-titlebar]")?.getAttribute("data-title-color")
  ).toBe("var(--chart-4)")
  act(() =>
    projectActions.updateTrack("gallery-audio", { name: "Changed owner", color: "var(--chart-1)" })
  )
  expect(useProjectState.getState().session.editingClipId).toBe("gallery-audio-override")
  expect(
    view.container.querySelector("[data-clip-editor-titlebar]")?.getAttribute("data-title-color")
  ).toBe("var(--chart-4)")
})

it("does not open a closed source editor through ordinary card or header selection", () => {
  projectActions.setEditingClip(null)
  const view = render(<SelectedEditor open={false} />)
  act(() => projectActions.selectTracks(["gallery-midi"], "header"))
  expect(useProjectState.getState().session.editingClipId).toBeNull()
  act(() => projectActions.selectClips(["gallery-midi-clip"]))
  expect(view.container.querySelector("[data-clip-editor]")).toBeNull()
})
