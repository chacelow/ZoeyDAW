// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import {
  hydrateProject,
  projectActions,
  serializeProject,
  useProjectState,
} from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { COLLAPSED_TRACK_HEIGHT, TRACK_RESIZE_STEP } from "@/pages/project/model/selectors"
import { TrackHeaderRow } from "."

function Row({ id }: { id: string }) {
  const track = useProjectState(state => state.document.tracks.find(item => item.id === id))
  return track ? <TrackHeaderRow track={track} rails={[]} /> : null
}

function current(id: string) {
  const track = useProjectState.getState().document.tracks.find(item => item.id === id)
  if (!track) throw new Error(`Missing track ${id}`)
  return track
}

beforeEach(async () => {
  await initI18n(appLocales).changeLanguage("en-US")
  const document = createMockDocument()
  for (const track of document.tracks) {
    track.collapsed = false
    track.heightPx = 70
  }
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
})

afterEach(cleanup)

for (const id of ["a-apply", "main"]) {
  it(`shrinks bottom-anchored ${id} downward and expands upward`, () => {
    const view = render(<Row id={id} />)
    const boundary = view.getByRole("separator")
    fireEvent.keyDown(boundary, { key: "ArrowDown" })
    expect(current(id).heightPx).toBe(53)
    fireEvent.keyDown(boundary, { key: "ArrowDown" })
    fireEvent.keyDown(boundary, { key: "ArrowDown" })
    expect(current(id).collapsed).toBe(true)
    fireEvent.keyDown(boundary, { key: "ArrowUp" })
    expect(current(id).collapsed).toBe(false)
  })
}

it("keeps ordinary tracks shrinking upward and expanding downward", () => {
  const view = render(<Row id="trager" />)
  const boundary = view.getByRole("separator")
  fireEvent.keyDown(boundary, { key: "ArrowUp" })
  expect(current("trager").heightPx).toBe(53)
  fireEvent.keyDown(boundary, { key: "ArrowDown" })
  expect(current("trager").heightPx).toBe(70)
})

it("keeps first-row mixer controls when collapsed", () => {
  for (const id of ["sidechain", "a-apply", "main"]) {
    projectActions.updateTrack(id, { collapsed: true })
    const view = render(<Row id={id} />)
    const row = view.container.querySelector(`[data-track-header="${id}"]`)
    if (!row) throw new Error(`Missing row ${id}`)
    const mixerElement = row.querySelector("section.arrangement-track-mixer")
    if (!(mixerElement instanceof HTMLElement)) throw new Error(`Missing mixer ${id}`)
    const mixer = within(mixerElement)
    if (id === "main") {
      expect(mixer.getByLabelText(/Cue .*Main/)).toBeTruthy()
      expect(mixer.queryByLabelText("Solo Main")).toBeNull()
      expect(view.getByLabelText(/(?:Output|输出) Main/)).toBeTruthy()
    } else {
      expect(
        mixer.getByLabelText(id === "a-apply" ? "Post A apply" : "Solo sidechain")
      ).toBeTruthy()
      expect(mixer.queryByLabelText(/(?:Volume|音量) (?:A apply|sidechain)/)).toBeNull()
    }
    view.unmount()
  }
})

it("hides unsupported controls instead of disabled arm placeholders", () => {
  for (const id of ["drums-group", "a-apply", "main"]) {
    const view = render(<Row id={id} />)
    expect(
      view.queryByLabelText(new RegExp(`(?:Record arm|录音准备) ${current(id).name}`))
    ).toBeNull()
    view.unmount()
  }
})

it("round-trips secondary channels, cue level and sends across a snapshot", () => {
  projectActions.updateTrack("3-audio", {
    inputChannel: "2",
    outputChannel: "3-4",
    sends: { "a-apply": -12.5 },
  })
  projectActions.updateTrack("main", { cueOutput: "1-2", outputChannel: "3-4", cueVolumeDb: -9.2 })
  projectActions.updateTrack("a-apply", { returnPost: false })
  hydrateProject(serializeProject())
  expect(current("3-audio")).toMatchObject({
    inputChannel: "2",
    outputChannel: "3-4",
    sends: { "a-apply": -12.5 },
  })
  expect(current("main")).toMatchObject({
    cueOutput: "1-2",
    outputChannel: "3-4",
    cueVolumeDb: -9.2,
  })
  expect(current("a-apply").returnPost).toBe(false)
})

it("reveals sends in three-column rows as the track height grows", () => {
  const document = structuredClone(useProjectState.getState().document)
  const destination = current("a-apply")
  for (let index = 0; index < 4; index++) {
    document.tracks.push({
      ...destination,
      id: `return-${index}`,
      name: `Return ${index}`,
    })
  }
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  const view = render(<Row id="3-audio" />)
  expect(view.getByLabelText("Send Return 1 3 Audio")).toBeTruthy()
  expect(view.queryByLabelText("Send Return 2 3 Audio")).toBeNull()
  fireEvent.keyDown(view.getByRole("separator"), { key: "ArrowDown" })
  expect(view.getByLabelText("Send Return 3 3 Audio")).toBeTruthy()
  fireEvent.keyDown(view.getByRole("separator"), { key: "ArrowUp" })
  expect(view.getByLabelText("Send Return 1 3 Audio")).toBeTruthy()
  expect(view.queryByLabelText("Send Return 2 3 Audio")).toBeNull()
  expect(view.queryByLabelText("Send Return 3 3 Audio")).toBeNull()
  fireEvent.keyDown(view.getByRole("separator"), { key: "ArrowUp" })
  expect(view.queryByLabelText("Send A apply 3 Audio")).toBeNull()
})

it("migrates an old Audio input channel without losing its hardware route", () => {
  const document = createMockDocument()
  const audio = document.tracks.find(track => track.id === "3-audio")
  if (!audio) throw new Error("Missing Audio track")
  audio.input = "2"
  delete audio.inputChannel
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  expect(current("3-audio")).toMatchObject({ input: "external", inputChannel: "2" })
  hydrateProject(serializeProject())
  expect(current("3-audio")).toMatchObject({ input: "external", inputChannel: "2" })
})

for (const id of ["3-audio", "trager"]) {
  it(`prioritizes routing controls at short expanded height for ${id}`, () => {
    projectActions.updateTrack(id, { heightPx: 35 })
    const name = current(id).name
    const view = render(<Row id={id} />)
    expect(view.queryByLabelText(`Input ${name}`)).toBeNull()
    expect(view.queryByLabelText(`Input channel ${name}`)).toBeNull()
    expect(view.getByLabelText(`Output ${name}`)).toBeTruthy()
    expect(view.queryByLabelText(`Send A apply ${name}`)).toBeNull()
    if (id === "3-audio") {
      expect(view.queryByRole("group", { name: `Monitor ${name}` })).toBeNull()
      expect(view.getByLabelText(`Output channel ${name}`)).toBeTruthy()
    } else {
      expect(view.getByRole("group", { name: `Monitor ${name}` })).toBeTruthy()
      expect(view.queryByLabelText(`Output channel ${name}`)).toBeNull()
    }
    act(() => projectActions.updateTrack(id, { heightPx: 104 }))
    expect(view.getByLabelText(`Input ${name}`)).toBeTruthy()
    expect(view.getByLabelText(`Input channel ${name}`)).toBeTruthy()
    expect(view.getByLabelText(`Output channel ${name}`)).toBeTruthy()
    if (id === "3-audio") expect(view.getByLabelText(`Send A apply ${name}`)).toBeTruthy()
  })
}

it("reveals input routing only after the fourth uniformly spaced row fits", () => {
  const requiredHeight = COLLAPSED_TRACK_HEIGHT + 3 * TRACK_RESIZE_STEP
  projectActions.updateTrack("3-audio", { heightPx: requiredHeight - 1 })
  const view = render(<Row id="3-audio" />)
  expect(view.queryByLabelText("Input 3 Audio")).toBeNull()
  expect(view.getByLabelText("Output 3 Audio")).toBeTruthy()
  act(() => projectActions.updateTrack("3-audio", { heightPx: requiredHeight }))
  expect(view.getByLabelText("Input 3 Audio")).toBeTruthy()
  expect(view.getByLabelText("Input channel 3 Audio")).toBeTruthy()
  act(() => projectActions.updateTrack("3-audio", { heightPx: requiredHeight - 1 }))
  expect(view.queryByLabelText("Input 3 Audio")).toBeNull()
})

it("switches track selection from the card without moving the insertion point", () => {
  const insertion = { trackId: "3-audio", bar: 4.25 }
  projectActions.setInsertionPoint(insertion)
  const view = render(
    <>
      <Row id="3-audio" />
      <Row id="4-midi" />
    </>
  )
  fireEvent(view.getByText("4 MIDI"), new MouseEvent("pointerdown", { bubbles: true, button: 0 }))
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["4-midi"])
  expect(useProjectState.getState().session.trackSelectionSurface).toBe("header")
  expect(useProjectState.getState().session.insertionPoint).toEqual(insertion)
  fireEvent(view.getByText("3 Audio"), new MouseEvent("pointerdown", { bubbles: true, button: 0 }))
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["3-audio"])
  expect(useProjectState.getState().session.trackSelectionSurface).toBe("header")
  expect(useProjectState.getState().session.insertionPoint).toEqual(insertion)
})
