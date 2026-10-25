// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { arrangementViewProjection } from "@/pages/project/layout"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import {
  arrangementBodyTop,
  isPinnedTrack,
  layoutTrackRowsForViewport,
  pinnedTopFor,
  pinnedTrackHeight,
  TIME_RULER_HEIGHT,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { TrackHeaderViewport } from "."

const ROW_HEIGHT = 70
const SCROLL_Y = ROW_HEIGHT * 8

function fixture() {
  const document = createMockDocument(ROW_HEIGHT)
  const audio = document.tracks.find(track => track.kind === "audio")
  if (!audio) throw new Error("Audio track fixture is required")
  document.tracks = [
    ...Array.from({ length: 20 }, (_, index) => ({
      ...audio,
      id: `header-${index}`,
      name: `Track ${index}`,
      collapsed: false,
      heightPx: ROW_HEIGHT,
      clips: [],
      devices: [],
    })),
    ...document.tracks
      .filter(isPinnedTrack)
      .map(track => ({ ...track, collapsed: false, heightPx: ROW_HEIGHT })),
  ]
  return document
}

function hydrate(document = fixture()) {
  hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
}

function geometry(scrollY = SCROLL_Y) {
  const state = useProjectState.getState()
  const projection = arrangementViewProjection(
    state.document.tracks,
    state.workspace.arrangementView
  )
  const height =
    arrangementBodyTop() +
    ROW_HEIGHT * 2 +
    pinnedTrackHeight(projection.visible) +
    TIME_RULER_HEIGHT
  const display = { mode: state.workspace.automationMode, lanes: state.workspace.automationLanes }
  return {
    ...projection,
    height,
    bottom: pinnedTopFor(projection.visible, height, display),
    rows: layoutTrackRowsForViewport(projection.visible, scrollY, height, display),
  }
}

function Headers({ scrollY = SCROLL_Y }: { readonly scrollY?: number }) {
  const tracks = useProjectState(state => state.document.tracks)
  const workspace = useProjectState(state => state.workspace)
  const projection = arrangementViewProjection(tracks, workspace.arrangementView)
  const height =
    arrangementBodyTop() +
    ROW_HEIGHT * 2 +
    pinnedTrackHeight(projection.visible) +
    TIME_RULER_HEIGHT
  return (
    <TrackHeaderViewport
      tracks={projection.visible}
      scrollY={scrollY}
      height={height}
      controlsWidth={projection.controlsWidth}
      routing={workspace.arrangementView.routing}
    />
  )
}

function header(container: HTMLElement, id: string) {
  const element = container.querySelector<HTMLElement>(`[data-track-header="${id}"]`)
  if (!element) throw new Error(`Missing header ${id}`)
  return element
}

function positionedRow(element: HTMLElement) {
  const wrapper = element.closest<HTMLElement>(".absolute.inset-x-0")
  if (!wrapper) throw new Error("Missing positioned header row")
  return wrapper
}

beforeEach(async () => {
  await initI18n(appLocales).changeLanguage("en-US")
  hydrate()
})
afterEach(cleanup)

it("mounts one viewport before and after the ordinary rows without expanding their visual clip", () => {
  const view = render(<Headers />)
  const mounted = [...view.container.querySelectorAll<HTMLElement>("[data-track-header]")]
  expect(mounted.map(element => element.dataset.trackHeader)).toEqual([
    "header-6",
    "header-7",
    "header-8",
    "header-9",
    "header-10",
    "header-11",
    ...geometry()
      .visible.filter(isPinnedTrack)
      .map(track => track.id),
  ])
  const clip = positionedRow(header(view.container, "header-8")).parentElement
  if (!clip) throw new Error("Missing ordinary header clip")
  expect(clip.classList.contains("overflow-hidden")).toBe(true)
  expect(clip.style.top).toBe(`${arrangementBodyTop()}px`)
  expect(clip.style.bottom).toBe(`${geometry().height - geometry().bottom}px`)
  for (const row of geometry().rows) {
    const element = view.container.querySelector<HTMLElement>(
      `[data-track-header="${row.track.id}"]`
    )
    if (!element) continue
    const wrapper = positionedRow(element)
    const clipTop = isPinnedTrack(row.track) ? geometry().bottom : arrangementBodyTop()
    expect(Number.parseFloat(wrapper.style.top) + clipTop).toBe(row.top)
    expect(wrapper.style.height).toBe(`${row.height}px`)
  }
})

it("keeps adjacent row DOM mounted as it enters the clipped viewport", () => {
  const view = render(<Headers />)
  const above = header(view.container, "header-7")
  const below = header(view.container, "header-10")
  view.rerender(<Headers scrollY={SCROLL_Y - ROW_HEIGHT} />)
  expect(header(view.container, "header-7")).toBe(above)
  view.rerender(<Headers scrollY={SCROLL_Y + ROW_HEIGHT} />)
  expect(header(view.container, "header-10")).toBe(below)
})

it("does not remount or reposition headers when horizontal navigation changes pan and zoom", () => {
  const view = render(<Headers />)
  const mounted = [...view.container.querySelectorAll<HTMLElement>("[data-track-header]")]
  const positions = mounted.map(element => positionedRow(element).getAttribute("style"))
  act(() => projectActions.setViewport({ scrollX: 2400, pxPerBar: 25 }))
  const after = [...view.container.querySelectorAll<HTMLElement>("[data-track-header]")]
  expect(after).toHaveLength(mounted.length)
  for (const [index, element] of after.entries()) {
    expect(element).toBe(mounted[index])
    expect(positionedRow(element).getAttribute("style")).toBe(positions[index])
  }
})

it("retains keyboard focus beyond the buffer and releases the row after blur while keeping pinned rows", () => {
  const view = render(<Headers />)
  const focused = header(view.container, "header-8")
  const button = view.getByLabelText("Solo Track 8")
  act(() => button.focus())
  expect(document.activeElement).toBe(button)
  view.rerender(<Headers scrollY={0} />)
  expect(header(view.container, "header-8")).toBe(focused)
  expect(document.activeElement).toBe(button)
  for (const track of geometry(0).visible.filter(isPinnedTrack)) {
    expect(header(view.container, track.id)).toBeTruthy()
  }
  act(() => button.blur())
  expect(view.container.querySelector('[data-track-header="header-8"]')).toBeNull()
})

it("does not retain children hidden by a collapsed group even when one had focus", () => {
  const document = fixture()
  const group = document.tracks.find(track => track.id === "header-6")
  if (!group) throw new Error("Group track fixture is required")
  group.kind = "group"
  group.childTrackIds = ["header-7", "header-8"]
  for (const track of document.tracks) {
    if (group.childTrackIds.includes(track.id)) track.output = group.id
  }
  hydrate(document)
  const view = render(<Headers />)
  const button = view.getByLabelText("Solo Track 8")
  act(() => button.focus())
  act(() => projectActions.updateTrack(group.id, { collapsed: true }))
  expect(header(view.container, group.id)).toBeTruthy()
  expect(view.container.querySelector('[data-track-header="header-7"]')).toBeNull()
  expect(view.container.querySelector('[data-track-header="header-8"]')).toBeNull()
  expect(button.isConnected).toBe(false)
})
