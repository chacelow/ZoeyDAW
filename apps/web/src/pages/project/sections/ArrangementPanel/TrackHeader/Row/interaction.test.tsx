import {
  DEFAULT_TRACK_HEIGHT,
  COLLAPSED_TRACK_HEIGHT,
  TRACK_RESIZE_STEP,
} from "@/pages/project/layout"
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
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { TrackHeaderRow } from "."

function Row({ id }: { readonly id: string }) {
  const track = useProjectState(state => state.document.tracks.find(item => item.id === id))
  const routing = useProjectState(state => state.workspace.arrangementView.routing)
  return track ? <TrackHeaderRow track={track} rails={[]} routing={routing} /> : null
}

function current(id: string) {
  const track = useProjectState.getState().document.tracks.find(item => item.id === id)
  if (!track) {
    throw new Error(`Missing track ${id}`)
  }
  return track
}

beforeEach(async () => {
  await initI18n(appLocales).changeLanguage("en-US")
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  for (const track of document.tracks) {
    track.collapsed = false
    track.heightPx = 70
  }
  hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
})

afterEach(cleanup)

for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
  it(`keeps a track rename draft during composition (${JSON.stringify(composition)})`, async () => {
    const original = current("3-audio").name
    const view = render(<Row id="3-audio" />)
    const row = view.container.querySelector<HTMLElement>('[data-track-header="3-audio"]')
    if (!row) throw new Error("Missing track row")
    fireEvent.contextMenu(row)
    fireEvent.click(await view.findByRole("menuitem", { name: "Rename" }))
    const input = view.getByRole("textbox", { name: "Track name" })
    fireEvent.change(input, { target: { value: "主唱" } })
    for (const key of ["Enter", "Escape"]) {
      expect(fireEvent.keyDown(input, { key, ...composition })).toBe(true)
      expect(document.activeElement).toBe(input)
      expect(current("3-audio").name).toBe(original)
      expect(useProjectState.getState().session.canUndo).toBe(false)
    }
    fireEvent.keyDown(input, { key: "Enter" })
    expect(current("3-audio").name).toBe("主唱")
    expect(view.queryByRole("textbox", { name: "Track name" })).toBeNull()
    act(() => projectActions.undo())
    expect(current("3-audio").name).toBe(original)
  })
}

it("keeps MIDI activation controls without displaying an audio mixer for MIDI-only tracks", () => {
  const view = render(
    <>
      <Row id="4-midi" />
      <Row id="3-audio" />
    </>
  )
  const midi = within(view.container.querySelector<HTMLElement>('[data-track-header="4-midi"]')!)
  expect(midi.getByLabelText("Solo 4 MIDI")).toBeTruthy()
  expect(midi.getByLabelText("Record arm 4 MIDI")).toBeTruthy()
  expect(midi.queryByLabelText("Volume 4 MIDI")).toBeNull()
  expect(midi.queryByLabelText("Pan 4 MIDI")).toBeNull()
  expect(midi.queryByLabelText("Level meter 4 MIDI")).toBeNull()
  expect(view.getByLabelText("Volume 3 Audio")).toBeTruthy()
})

it("removes the entire routing column while retaining track output and mixer", () => {
  const original = current("3-audio")
  const view = render(<Row id="3-audio" />)
  const row = view.container.querySelector<HTMLElement>('[data-track-header="3-audio"]')!
  expect(row.querySelector(".arrangement-track-routing")).toBeTruthy()
  act(() => projectActions.setArrangementView("routing", false))
  expect(row.querySelector(".arrangement-track-routing")).toBeNull()
  expect(row.style.gridTemplateColumns).not.toContain("--project-routing-width")
  expect(row.querySelector(".arrangement-track-mixer")).toBeTruthy()
  expect(current("3-audio")).toBe(original)
  act(() => projectActions.setArrangementView("routing", true))
  expect(row.querySelector(".arrangement-track-routing")).toBeTruthy()
  expect(row.style.gridTemplateColumns).toBe("")
  expect(current("3-audio").output).toBe(original.output)
})

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
    const row = view.container.querySelector(`[data-track-header="${CSS.escape(id)}"]`)
    if (!row) {
      throw new Error(`Missing row ${id}`)
    }
    const mixerElement = row.querySelector("section.arrangement-track-mixer")
    if (!(mixerElement instanceof HTMLElement)) {
      throw new TypeError(`Missing mixer ${id}`)
    }
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
  hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
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
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const audio = document.tracks.find(track => track.id === "3-audio")
  if (!audio) {
    throw new Error("Missing Audio track")
  }
  audio.input = "2"
  delete audio.inputChannel
  hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
  expect(current("3-audio")).toMatchObject({ input: "external", inputChannel: "2" })
  hydrateProject(serializeProject())
  expect(current("3-audio")).toMatchObject({ input: "external", inputChannel: "2" })
})

for (const id of ["3-audio", "trager"]) {
  it(`drops exactly one routing row per resize step on ${id}`, () => {
    const { name } = current(id)
    const routingRows = (view: ReturnType<typeof render>) =>
      view.container.querySelectorAll(".arrangement-track-routing > *").length
    // A revealed track always fits two rows; each further step adds one more.
    projectActions.updateTrack(id, { heightPx: COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP })
    const view = render(<Row id={id} />)
    const counts = [routingRows(view)]
    for (let step = 1; step <= 3; step++) {
      act(() =>
        projectActions.updateTrack(id, {
          heightPx: COLLAPSED_TRACK_HEIGHT + (step + 1) * TRACK_RESIZE_STEP,
        })
      )
      counts.push(routingRows(view))
    }
    // Audio has no channel dropdown for its main output; MIDI always has one.
    expect(counts).toEqual(id === "trager" ? [2, 3, 4, 5] : [2, 3, 4, 4])
    // Shrinking reverses the same steps instead of dropping two rows at once.
    act(() =>
      projectActions.updateTrack(id, {
        heightPx: COLLAPSED_TRACK_HEIGHT + 2 * TRACK_RESIZE_STEP,
      })
    )
    expect(routingRows(view)).toBe(3)
    act(() =>
      projectActions.updateTrack(id, {
        heightPx: COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP,
      })
    )
    expect(routingRows(view)).toBe(2)
    // The tail stays: the output row survives at the minimum height.
    expect(view.getByLabelText(`Output ${name}`)).toBeTruthy()
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
it("keeps a single track on plain click and toggles additive selection with Ctrl", () => {
  const view = render(
    <>
      <Row id="3-audio" />
      <Row id="4-midi" />
    </>
  )
  fireEvent.pointerDown(view.getByText("3 Audio"), { bubbles: true, button: 0 })
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["3-audio"])
  fireEvent.pointerDown(view.getByText("4 MIDI"), { bubbles: true, button: 0, ctrlKey: true })
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["3-audio", "4-midi"])
  fireEvent.pointerDown(view.getByText("3 Audio"), { bubbles: true, button: 0, ctrlKey: true })
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["4-midi"])
})
it("uses exclusive Arm clicks and additive Ctrl Arm clicks", () => {
  const view = render(
    <>
      <Row id="3-audio" />
      <Row id="4-midi" />
    </>
  )
  fireEvent.click(view.getByLabelText("Record arm 3 Audio"))
  expect(current("3-audio").armed).toBe(true)
  fireEvent.click(view.getByLabelText("Record arm 4 MIDI"))
  expect(current("3-audio").armed).toBe(false)
  expect(current("4-midi").armed).toBe(true)
  const audioArm = view.getByLabelText("Record arm 3 Audio")
  fireEvent.pointerDown(audioArm, { bubbles: true, button: 0, ctrlKey: true })
  fireEvent.click(audioArm, { bubbles: true, button: 0, ctrlKey: true })
  expect(current("3-audio").armed).toBe(true)
  expect(current("4-midi").armed).toBe(true)
})

it("does not capture portaled automation menu items as track resize gestures", async () => {
  projectActions.setMode("automationMode", true)
  const view = render(<Row id="main" />)
  fireEvent.click(view.getByLabelText("Automation device Main"))
  const mixer = await view.findByRole("menuitem", { name: "Mixer" })
  const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 })
  expect(fireEvent(mixer, event)).toBe(true)
  fireEvent.click(mixer)
  expect(view.getByLabelText("Automation parameter Main").hasAttribute("disabled")).toBe(false)
})
