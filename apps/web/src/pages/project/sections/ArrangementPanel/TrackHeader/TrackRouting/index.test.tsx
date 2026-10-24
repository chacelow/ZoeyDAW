import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import { publishNativeAudioStatus } from "@/shared/native/audio"
import { TrackRouting } from "."
import type { AudioDeviceSnapshot } from "@/shared/native/audio"

afterEach(() => {
  cleanup()
  publishNativeAudioStatus({ device: null })
})
it("offers only enabled soundcard channels and updates options from acknowledged configuration", async () => {
  await initI18n(appLocales).changeLanguage("en-US")
  const capabilities = {
    host: "CoreAudio",
    inputDeviceId: null,
    outputDeviceId: "out",
    inputChannelNames: [],
    outputChannelNames: ["1", "2", "3", "4", "5", "6"],
    sampleRates: [48000],
    bufferSizes: [512],
    defaultSampleRate: 48000,
    defaultBufferFrames: 512,
    separateInputOutput: true,
    controlPanel: false,
  }
  const configuration = {
    host: "CoreAudio",
    inputDeviceId: null,
    outputDeviceId: "out",
    sampleRate: 48000,
    bufferFrames: 512,
    inputMono: [],
    inputStereo: [],
    outputMono: [4, 5],
    outputStereo: [4],
  }
  const device: AudioDeviceSnapshot = {
    state: "ready",
    host: "CoreAudio",
    deviceId: "out",
    deviceName: "Interface",
    sampleRate: 48000,
    bufferFrames: 512,
    inputChannels: 0,
    outputChannels: 2,
    inputDeviceId: null,
    inputDeviceName: null,
    inputLatencyFrames: 0,
    outputLatencyFrames: 512,
    hosts: [],
    inputDevices: [],
    outputDevices: [],
    devices: [],
    error: null,
    capabilities,
    configuration,
  }
  publishNativeAudioStatus({ device })
  const track = createMockDocument(DEFAULT_TRACK_HEIGHT).tracks.find(item => item.kind === "main")
  if (!track) throw new Error("Missing Main fixture")
  render(<TrackRouting track={{ ...track, collapsed: true }} />)
  fireEvent.click(screen.getByRole("button"))
  expect(await screen.findByRole("menuitem", { name: "5 / 6" })).toBeTruthy()
  expect(screen.queryByRole("menuitem", { name: "1 / 2" })).toBeNull()
  fireEvent.keyDown(document, { key: "Escape" })
  act(() =>
    publishNativeAudioStatus({
      device: {
        ...device,
        configuration: { ...configuration, outputMono: [0, 1], outputStereo: [0] },
      },
    })
  )
  fireEvent.click(screen.getByRole("button"))
  expect(await screen.findByRole("menuitem", { name: "1 / 2" })).toBeTruthy()
  expect(screen.queryByRole("menuitem", { name: "5 / 6" })).toBeNull()
})
