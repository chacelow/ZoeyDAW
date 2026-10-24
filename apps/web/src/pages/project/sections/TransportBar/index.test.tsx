// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { I18nProvider, initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
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
})
