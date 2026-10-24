// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  nativePlugins,
  type PluginCatalogEntry,
  type PluginScanReport,
} from "@/shared/native/plugins"
import { PluginSettings } from "./PluginSettings"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
function entry(name: string): PluginCatalogEntry {
  return {
    catalogId: name.repeat(64).slice(0, 64),
    plugin: {
      format: "Clap",
      class_id: name,
      name,
      vendor: "Fixture",
      version: "1",
      sdk_version: "1",
      kind: "Effect",
      categories: [],
    },
  }
}

beforeEach(() => {
  vi.spyOn(nativePlugins, "available").mockReturnValue(true)
  vi.spyOn(nativePlugins, "entries").mockResolvedValue([])
  vi.spyOn(nativePlugins, "pickFolder").mockResolvedValue("/fixtures")
  vi.spyOn(nativePlugins, "cancel").mockResolvedValue()
  vi.spyOn(nativePlugins, "reserve").mockResolvedValue()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it("does not let a late initial catalog overwrite a completed scan", async () => {
  const initial = deferred<PluginCatalogEntry[]>()
  vi.mocked(nativePlugins.entries).mockReturnValue(initial.promise)
  vi.spyOn(nativePlugins, "scan").mockResolvedValue({
    entries: [entry("new")],
    issues: [],
    cancelled: false,
  })
  const view = render(<PluginSettings />)
  fireEvent.click(view.getByRole("button"))
  await waitFor(() => expect(view.getByText("new")).toBeTruthy())
  await act(async () => initial.resolve([entry("old")]))
  expect(view.queryByText("old")).toBeNull()
  expect(view.getByText("new")).toBeTruthy()
})

it("keeps scan admission disabled until cancellation cleanup returns", async () => {
  const scan = deferred<PluginScanReport>()
  vi.spyOn(nativePlugins, "scan").mockReturnValue(scan.promise)
  const view = render(<PluginSettings />)
  fireEvent.click(view.getByRole("button"))
  await waitFor(() => expect(view.getAllByRole("button")).toHaveLength(2))
  fireEvent.click(view.getAllByRole("button")[1])
  await waitFor(() => expect(nativePlugins.cancel).toHaveBeenCalled())
  expect(view.getAllByRole("button").every(button => button.hasAttribute("disabled"))).toBe(true)
  await act(async () => scan.resolve({ entries: [], issues: [], cancelled: true }))
  expect(view.getByRole("button").hasAttribute("disabled")).toBe(false)
})

it("cancels its own scan on unmount without publishing its late result", async () => {
  const scan = deferred<PluginScanReport>()
  const invoke = vi.spyOn(nativePlugins, "scan").mockReturnValue(scan.promise)
  const view = render(<PluginSettings />)
  fireEvent.click(view.getByRole("button"))
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  const id = invoke.mock.calls[0][0]
  view.unmount()
  expect(nativePlugins.cancel).toHaveBeenCalledWith(id)
  await act(async () => scan.resolve({ entries: [entry("late")], issues: [], cancelled: false }))
})

it("releases late admission after unmount without starting a scan", async () => {
  const admission = deferred<undefined>()
  vi.mocked(nativePlugins.reserve).mockReturnValue(admission.promise)
  const scan = vi.spyOn(nativePlugins, "scan")
  const view = render(<PluginSettings />)
  fireEvent.click(view.getByRole("button"))
  await waitFor(() => expect(nativePlugins.reserve).toHaveBeenCalled())
  const id = vi.mocked(nativePlugins.reserve).mock.calls[0][0]
  expect(scan).not.toHaveBeenCalled()
  view.unmount()
  await act(async () => admission.resolve(undefined))
  expect(nativePlugins.cancel).toHaveBeenCalledWith(id)
  expect(scan).not.toHaveBeenCalled()
})
