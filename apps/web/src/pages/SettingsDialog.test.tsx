// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useSettingsDialog } from "@/shared/app-shared"
import {
  getAudioImportPreferences,
  setAudioImportPreferences,
} from "@/shared/app-shared/audio-import-preferences"
import { SettingsDialog } from "./SettingsDialog"

beforeEach(() => {
  localStorage.clear()
  useSettingsDialog.getState().openSettings("import")
})
afterEach(() => {
  cleanup()
  useSettingsDialog.getState().closeSettings()
  vi.restoreAllMocks()
})

it("offers persisted Auto-Warp in its own shared SettingsShell section", () => {
  const view = render(<SettingsDialog />)
  const checkbox = view.getByRole("checkbox")
  expect(checkbox.getAttribute("aria-checked")).toBe("true")
  fireEvent.click(checkbox)
  expect(getAudioImportPreferences()).toEqual({ autoWarp: false })
  expect(checkbox.getAttribute("aria-checked")).toBe("false")
  view.unmount()
  expect(
    render(<SettingsDialog />)
      .getByRole("checkbox")
      .getAttribute("aria-checked")
  ).toBe("false")
})

it("keeps the acknowledged setting and shows an error if storage rejects the write", () => {
  setAudioImportPreferences({ autoWarp: false })
  const view = render(<SettingsDialog />)
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Denied")
  })
  fireEvent.click(view.getByRole("checkbox"))
  expect(view.getByRole("checkbox").getAttribute("aria-checked")).toBe("false")
  expect(getAudioImportPreferences()).toEqual({ autoWarp: false })
  expect(view.getByRole("alert")).toBeTruthy()
})
