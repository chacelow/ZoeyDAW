// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  AUDIO_IMPORT_PREFERENCES_KEY,
  getAudioImportPreferences,
  setAudioImportPreferences,
} from "./audio-import-preferences"

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

it("defaults Auto-Warp on without authoring project state", () => {
  expect(getAudioImportPreferences()).toEqual({ autoWarp: true })
  expect(localStorage.length).toBe(0)
})

it("persists the application preference across reads", () => {
  expect(setAudioImportPreferences({ autoWarp: false })).toBe(true)
  expect(getAudioImportPreferences()).toEqual({ autoWarp: false })
  expect(JSON.parse(localStorage.getItem(AUDIO_IMPORT_PREFERENCES_KEY)!)).toEqual({
    autoWarp: false,
  })
  expect(setAudioImportPreferences({ autoWarp: true })).toBe(true)
  expect(getAudioImportPreferences()).toEqual({ autoWarp: true })
})

it.each(["not-json", "null", "true", "{}", '{"autoWarp":"false"}', '{"autoWarp":0}'])(
  "ignores malformed stored preference %s",
  raw => {
    localStorage.setItem(AUDIO_IMPORT_PREFERENCES_KEY, raw)
    expect(getAudioImportPreferences()).toEqual({ autoWarp: true })
  }
)

it("uses the default when reading storage is denied", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Denied")
  })
  expect(getAudioImportPreferences()).toEqual({ autoWarp: true })
})

it("reports failed persistence and retains the last saved value", () => {
  setAudioImportPreferences({ autoWarp: false })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota")
  })
  expect(setAudioImportPreferences({ autoWarp: true })).toBe(false)
  expect(getAudioImportPreferences()).toEqual({ autoWarp: false })
})
