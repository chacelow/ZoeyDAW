// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { I18nProvider, initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { normalizedAutomationValue } from "@zoeydaw/project-core/automation-curve"
import { TransportBar } from "."

describe("TransportBar", () => {
  beforeEach(async () => {
    await initI18n(appLocales).changeLanguage("zh-CN")
    hydrateProject(
      JSON.stringify({
        version: 4,
        document: createMockDocument(108),
        workspace: createMockWorkspace(),
      })
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("starts all armed tracks from Header Record and preserves playback when recording is toggled off", async () => {
    await initI18n(appLocales).changeLanguage("en-US")
    const tracks = useProjectState
      .getState()
      .document.tracks.filter(track => track.kind === "audio" || track.kind === "midi")
      .slice(0, 2)
    act(() => {
      for (const track of tracks) projectActions.updateTrack(track.id, { armed: true })
    })
    const view = render(
      <I18nProvider>
        <TransportBar onBack={vi.fn()} onToggleBrowser={vi.fn()} />
      </I18nProvider>
    )
    fireEvent.click(view.getByRole("button", { name: "Record" }))
    expect(useProjectState.getState().session).toMatchObject({ playing: true, recording: true })
    expect(
      tracks.every(
        track =>
          useProjectState.getState().document.tracks.find(item => item.id === track.id)?.armed
      )
    ).toBe(true)
    fireEvent.click(view.getByRole("button", { name: "Record" }))
    expect(useProjectState.getState().session).toMatchObject({ playing: true, recording: false })
    fireEvent.click(view.getByRole("button", { name: "Record" }))
    fireEvent.click(view.getAllByRole("button", { name: "Stop" })[1])
    expect(useProjectState.getState().session).toMatchObject({ playing: false, recording: false })
  })

  it("renders metronome button and toggles metronome state on click", () => {
    const view = render(
      <I18nProvider>
        <TransportBar onBack={vi.fn()} onToggleBrowser={vi.fn()} />
      </I18nProvider>
    )

    const metronomeButton = view.getByRole("button", { name: /节拍器/ })
    expect(metronomeButton.getAttribute("aria-pressed")).toBe("false")
    expect(useProjectState.getState().workspace.metronome).toBe(false)

    fireEvent.click(metronomeButton)
    expect(useProjectState.getState().workspace.metronome).toBe(true)
    expect(metronomeButton.getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(metronomeButton)
    expect(useProjectState.getState().workspace.metronome).toBe(false)
    expect(metronomeButton.getAttribute("aria-pressed")).toBe("false")
  })

  it("animates the metronome icon side to side once per BPM beat alternating filled side during playback", () => {
    act(() => {
      projectActions.setMetronome(true)
    })
    const view = render(
      <I18nProvider>
        <TransportBar onBack={vi.fn()} onToggleBrowser={vi.fn()} />
      </I18nProvider>
    )

    const metronomeButton = view.getByRole("button", { name: /节拍器/ })
    const getCircles = () => metronomeButton.querySelectorAll("circle")
    expect(getCircles()).toHaveLength(2)

    // When stopped and active, both circles are filled
    expect(getCircles()[0].getAttribute("fill")).toBe("currentColor")
    expect(getCircles()[1].getAttribute("fill")).toBe("currentColor")

    // Start playback on beat 1 (odd beat) -> left filled, right outlined
    act(() => {
      projectActions.togglePlay()
      projectActions.setPosition({ bar: 1, beat: 1, sixteenth: 1 })
    })
    expect(getCircles()[0].getAttribute("fill")).toBe("currentColor")
    expect(getCircles()[1].getAttribute("fill")).toBe("none")

    // On beat 2 (even beat) -> left outlined, right filled (swung to right side)
    act(() => {
      projectActions.setPosition({ bar: 1, beat: 2, sixteenth: 1 })
    })
    expect(getCircles()[0].getAttribute("fill")).toBe("none")
    expect(getCircles()[1].getAttribute("fill")).toBe("currentColor")

    // On beat 3 (odd beat) -> left filled, right outlined (swung to left side)
    act(() => {
      projectActions.setPosition({ bar: 1, beat: 3, sixteenth: 1 })
    })
    expect(getCircles()[0].getAttribute("fill")).toBe("currentColor")
    expect(getCircles()[1].getAttribute("fill")).toBe("none")

    // On beat 4 (even beat) -> left outlined, right filled
    act(() => {
      projectActions.setPosition({ bar: 1, beat: 4, sixteenth: 1 })
    })
    expect(getCircles()[0].getAttribute("fill")).toBe("none")
    expect(getCircles()[1].getAttribute("fill")).toBe("currentColor")

    // Stop playback -> returns to both filled while active
    act(() => {
      projectActions.stop()
    })
    expect(getCircles()[0].getAttribute("fill")).toBe("currentColor")
    expect(getCircles()[1].getAttribute("fill")).toBe("currentColor")
  })

  it("renders Link button and toggles link state", () => {
    const view = render(
      <I18nProvider>
        <TransportBar onBack={vi.fn()} onToggleBrowser={vi.fn()} />
      </I18nProvider>
    )

    const linkButton = view.getByRole("button", { name: /Link/i })
    expect(linkButton.getAttribute("aria-pressed")).toBe("false")
    expect(useProjectState.getState().workspace.link).toBe(false)

    fireEvent.click(linkButton)
    expect(useProjectState.getState().workspace.link).toBe(true)
    expect(linkButton.getAttribute("aria-pressed")).toBe("true")
  })
  it.each([3, 3.9, 0, 64, NaN])(
    "rejects denominator action %s without changing grid or history",
    value => {
      const previous = useProjectState.getState()
      act(() => projectActions.setDenominator(value))
      expect(useProjectState.getState()).toBe(previous)
    }
  )

  it("steps the denominator through supported note values instead of producing 3 or 5", () => {
    vi.useFakeTimers()
    const view = render(
      <I18nProvider>
        <TransportBar onBack={vi.fn()} onToggleBrowser={vi.fn()} />
      </I18nProvider>
    )
    const control = view.getByLabelText("DEN")
    for (const expected of [8, 16, 32, 32]) {
      fireEvent.wheel(control, { deltaY: -40 })
      expect(useProjectState.getState().document.transport.denominator).toBe(expected)
      act(() => vi.advanceTimersByTime(200))
    }
    for (const expected of [16, 8, 4, 2, 1, 1]) {
      fireEvent.wheel(control, { deltaY: 40 })
      expect(useProjectState.getState().document.transport.denominator).toBe(expected)
      act(() => vi.advanceTimersByTime(200))
    }
  })

  it("follows Main tempo points and restores manual BPM editing when the envelope is removed", () => {
    const target = { kind: "mixer", parameter: "tempo" } as const
    projectActions.setAutomationTarget("main", target)
    projectActions.setAutomationPoint("main", "main-mixer-tempo", {
      bar: 1,
      value: normalizedAutomationValue(target, 90),
    })
    projectActions.setAutomationPoint("main", "main-mixer-tempo", {
      bar: 3,
      value: normalizedAutomationValue(target, 180),
    })
    const view = render(
      <I18nProvider>
        <TransportBar onBack={vi.fn()} onToggleBrowser={vi.fn()} />
      </I18nProvider>
    )
    const bpm = view.getByLabelText("BPM")
    expect(view.getByText("90.00").closest("button")).toBe(bpm)
    const baseline = useProjectState.getState().document.transport.bpm
    fireEvent.wheel(bpm, { deltaY: -40 })
    expect(useProjectState.getState().document.transport.bpm).toBe(baseline)
    act(() => projectActions.setPosition({ bar: 3, beat: 1, sixteenth: 1 }))
    expect(view.getByText("180.00").closest("button")).toBe(bpm)
    act(() => projectActions.replaceAutomationPoints("main", "main-mixer-tempo", []))
    fireEvent.wheel(bpm, { deltaY: -40 })
    expect(useProjectState.getState().document.transport.bpm).toBeGreaterThan(baseline)
  })

  it("selects Touch and Latch recording without starting playback or dirtying the document", async () => {
    const view = render(
      <I18nProvider>
        <TransportBar onBack={vi.fn()} onToggleBrowser={vi.fn()} />
      </I18nProvider>
    )
    fireEvent.click(view.getByLabelText("自动化录制"))
    fireEvent.click(await view.findByRole("menuitem", { name: "Touch" }))
    expect(useProjectState.getState().session.automationRecordMode).toBe("touch")
    fireEvent.click(view.getByLabelText("自动化录制"))
    fireEvent.click(await view.findByRole("menuitem", { name: "Latch" }))
    expect(useProjectState.getState().session).toMatchObject({
      automationRecordMode: "latch",
      playing: false,
      dirty: false,
    })
  })

  it("parses typed note values and rejects unsupported denominators without normalizing them", () => {
    const view = render(
      <I18nProvider>
        <TransportBar onBack={vi.fn()} onToggleBrowser={vi.fn()} />
      </I18nProvider>
    )
    fireEvent.click(view.getByLabelText("DEN"))
    fireEvent.keyDown(document, { key: "3" })
    const invalid = view.getByRole("textbox", { name: "DEN" })
    fireEvent.keyDown(invalid, { key: "Enter" })
    expect(useProjectState.getState().document.transport.denominator).toBe(4)
    fireEvent.click(view.getByLabelText("DEN"))
    fireEvent.keyDown(document, { key: "1" })
    const valid = view.getByRole("textbox", { name: "DEN" })
    fireEvent.change(valid, { target: { value: "16" } })
    fireEvent.keyDown(valid, { key: "Enter" })
    expect(useProjectState.getState().document.transport.denominator).toBe(16)
  })
})
