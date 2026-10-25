// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { useProjectState } from "@/pages/project/stores/useProjectState"
import { publishNativeAudioStatus } from "@/shared/native/audio"
import { BackendStatus } from "./BackendStatus"

afterEach(() => {
  cleanup()
  publishNativeAudioStatus({ error: null })
  useProjectState.setState(state => ({
    session: { ...state.session, backend: { ...state.session.backend, error: null } },
  }))
})

it("shows the native recording reason with a backend failure and removes it after recovery", async () => {
  await initI18n(appLocales).changeLanguage("en-US")
  useProjectState.setState(state => ({
    session: {
      ...state.session,
      snapshotError: null,
      backend: { ...state.session.backend, error: "connection" },
    },
  }))
  publishNativeAudioStatus({ error: "No armed audio track has an enabled input" })
  const view = render(<BackendStatus />)
  expect(view.getByRole("alert").textContent).toContain("No armed audio track has an enabled input")
  act(() => {
    publishNativeAudioStatus({ error: null })
    useProjectState.setState(state => ({
      session: { ...state.session, backend: { ...state.session.backend, error: null } },
    }))
  })
  expect(view.queryByRole("alert")).toBeNull()
})
