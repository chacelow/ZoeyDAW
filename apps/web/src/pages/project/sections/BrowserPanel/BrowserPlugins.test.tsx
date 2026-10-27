// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { nativePlugins } from "@/shared/native/plugins"
import { BROWSER_PLUGIN_MIME, browserPluginDrag } from "@/pages/project/adapters/browser"
import * as pluginAdapters from "@/pages/project/adapters"
import { BrowserPlugins } from "./BrowserPlugins"
import type { PluginCatalogEntry } from "@/shared/native/plugins"

const instrument: PluginCatalogEntry = {
  catalogId: "a".repeat(64),
  plugin: {
    format: "Clap",
    class_id: "synth",
    name: "Synth",
    vendor: "Vendor",
    version: "1",
    sdk_version: "1",
    kind: "Instrument",
    categories: [],
  },
}
const effect: PluginCatalogEntry = {
  ...instrument,
  catalogId: "b".repeat(64),
  plugin: { ...instrument.plugin, name: "Delay", kind: "Effect" },
}
afterEach(() => {
  cleanup()
  browserPluginDrag.clear()
  vi.restoreAllMocks()
})

it("lists matching instruments and starts an authenticated plugin drag", async () => {
  vi.spyOn(nativePlugins, "available").mockReturnValue(true)
  vi.spyOn(nativePlugins, "entries").mockResolvedValue([instrument, effect])
  const view = render(<BrowserPlugins scope="instruments" query="synth" />)
  await waitFor(() => expect(view.getByText("Synth")).toBeTruthy())
  expect(view.queryByText("Delay")).toBeNull()
  const values = new Map<string, string>()
  const dataTransfer = {
    effectAllowed: "",
    setData: (key: string, value: string) => values.set(key, value),
  }
  fireEvent.dragStart(view.getByText("Synth"), { dataTransfer })
  expect(browserPluginDrag.read(values.get(BROWSER_PLUGIN_MIME) ?? "")).toEqual(instrument)
  fireEvent.dragEnd(view.getByText("Synth"))
  expect(browserPluginDrag.peek()).toBeNull()
})

it("inserts plugin into track or creates a new track on double click", async () => {
  vi.spyOn(nativePlugins, "available").mockReturnValue(true)
  vi.spyOn(nativePlugins, "entries").mockResolvedValue([instrument])
  const insertSpy = vi.spyOn(pluginAdapters, "insertPluginNewTrack").mockResolvedValue("new-track")
  const view = render(<BrowserPlugins scope="instruments" query="" />)
  await waitFor(() => expect(view.getByText("Synth")).toBeTruthy())
  fireEvent.doubleClick(view.getByText("Synth"))
  expect(insertSpy).toHaveBeenCalledWith(instrument)
})
