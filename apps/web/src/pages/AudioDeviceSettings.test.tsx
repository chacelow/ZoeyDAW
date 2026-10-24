// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react"
import type { RenderResult } from "@testing-library/react"
import { I18nProvider, initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import {
  nativeAudio,
  publishNativeAudioStatus,
  readNativeAudioStatus,
  type AudioDeviceCapabilities,
  type AudioDeviceCapabilitiesRequest,
  type AudioDeviceConfiguration,
  type AudioDeviceSnapshot,
} from "@/shared/native/audio"
import { AudioDeviceSettings } from "./AudioDeviceSettings"

const input = {
  id: "CoreAudio::E2",
  name: "E2",
  host: "CoreAudio",
  inputChannels: 4,
  outputChannels: 4,
}
const output = {
  id: "CoreAudio::Alt",
  name: "Alt",
  host: "CoreAudio",
  inputChannels: 0,
  outputChannels: 4,
}
const microphone = {
  id: "CoreAudio::USB",
  name: "USB Mic",
  host: "CoreAudio",
  inputChannels: 4,
  outputChannels: 0,
}
const configuration: AudioDeviceConfiguration = {
  host: "CoreAudio",
  inputDeviceId: null,
  outputDeviceId: input.id,
  sampleRate: 48000,
  bufferFrames: 512,
  inputMono: [],
  inputStereo: [],
  outputMono: [],
  outputStereo: [0],
}
function capabilities(request: AudioDeviceCapabilitiesRequest): AudioDeviceCapabilities {
  return {
    host: request.host,
    inputDeviceId: request.inputDeviceId,
    outputDeviceId: request.outputDeviceId,
    inputChannelNames: request.inputDeviceId ? ["Mic A", "Mic B", "Mic C", "Mic D"] : [],
    outputChannelNames: ["Out A", "Out B", "Out C", "Out D"],
    sampleRates: [48000, 96000],
    bufferSizes: [192, 512],
    defaultSampleRate: 48000,
    defaultBufferFrames: 512,
    separateInputOutput: true,
    controlPanel: false,
  }
}
const snapshot: AudioDeviceSnapshot = {
  state: "ready",
  host: "CoreAudio",
  deviceId: input.id,
  deviceName: input.name,
  sampleRate: 48000,
  bufferFrames: 512,
  outputChannels: 2,
  devices: [input, output, microphone],
  inputDevices: [input, microphone],
  outputDevices: [input, output],
  hosts: [{ id: "CoreAudio", name: "CoreAudio", separateInputOutput: true, controlPanel: false }],
  configuration,
  capabilities: capabilities(configuration),
  inputDeviceId: null,
  inputDeviceName: null,
  inputChannels: 0,
  inputLatencyFrames: 0,
  outputLatencyFrames: 240,
  error: null,
}

beforeEach(async () => {
  await initI18n(appLocales).changeLanguage("en-US")
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  publishNativeAudioStatus({ device: null, issues: [], error: null })
  vi.spyOn(nativeAudio, "available").mockReturnValue(true)
  vi.spyOn(nativeAudio, "devices").mockResolvedValue(snapshot)
  vi.spyOn(nativeAudio, "deviceCapabilities").mockImplementation(async request =>
    capabilities(request)
  )
  vi.spyOn(nativeAudio, "configureDevice").mockResolvedValue(snapshot)
  vi.spyOn(nativeAudio, "openDeviceControlPanel").mockResolvedValue(snapshot)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function mount() {
  return render(
    <I18nProvider resources={appLocales}>
      <AudioDeviceSettings />
    </I18nProvider>
  )
}
async function choose(view: RenderResult, control: string, item: string) {
  fireEvent.click(view.getByRole("button", { name: control }))
  fireEvent.click(await view.findByRole("menuitem", { name: item }))
}
async function ready(view: RenderResult) {
  await waitFor(() =>
    expect(view.getByRole("button", { name: "Apply" }).hasAttribute("disabled")).toBe(false)
  )
}

it("uses only native-supported choices and keeps the draft out of global actual state", async () => {
  const view = mount()
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Requested buffer size" }))
  expect(view.getAllByRole("menuitem").map(item => item.textContent)).toEqual([
    "192 frames",
    "512 frames",
  ])
  fireEvent.click(view.getByRole("menuitem", { name: "192 frames" }))
  expect(readNativeAudioStatus().device).toBe(snapshot)
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
  expect(view.getByText("Draft only — not applied to the audio engine")).toBeTruthy()
  const actual = within(view.getByLabelText("Actual native configuration"))
  expect(actual.getAllByText("512 frames")).toHaveLength(2)
  expect(actual.getAllByText("5.00 ms")).toHaveLength(2)
  expect(view.queryByRole("button", { name: "Driver settings…" })).toBeNull()
})

it("ignores a late capability response after a newer device selection", async () => {
  let resolveLate: (value: AudioDeviceCapabilities) => void = (_value: AudioDeviceCapabilities) => {
    throw new Error("No pending capability request")
  }
  const late = new Promise<AudioDeviceCapabilities>(resolve => {
    resolveLate = resolve
  })
  vi.mocked(nativeAudio.deviceCapabilities).mockImplementation(request =>
    request.outputDeviceId === output.id ? late : Promise.resolve(capabilities(request))
  )
  const view = mount()
  await ready(view)
  await choose(view, "Output device", "Alt")
  await waitFor(() =>
    expect(nativeAudio.deviceCapabilities).toHaveBeenLastCalledWith({
      host: "CoreAudio",
      inputDeviceId: null,
      outputDeviceId: output.id,
    })
  )
  await choose(view, "Output device", "E2")
  await ready(view)
  await act(async () =>
    resolveLate({
      ...capabilities({ host: "CoreAudio", inputDeviceId: null, outputDeviceId: output.id }),
      sampleRates: [44100],
      bufferSizes: [64],
      defaultSampleRate: 44100,
      defaultBufferFrames: 64,
    })
  )
  expect(view.getByRole("button", { name: "Output device" }).textContent).toContain("E2")
  fireEvent.click(view.getByRole("button", { name: "Requested buffer size" }))
  expect(view.getAllByRole("menuitem").map(item => item.textContent)).toEqual([
    "192 frames",
    "512 frames",
  ])
  expect(readNativeAudioStatus().device).toBe(snapshot)
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
})

it("applies the complete independent-device configuration with mono and stereo masks", async () => {
  vi.mocked(nativeAudio.configureDevice).mockImplementation(async request => ({
    ...snapshot,
    configuration: request,
    capabilities: capabilities(request),
    inputDeviceId: microphone.id,
    inputDeviceName: microphone.name,
    inputChannels: 3,
    inputLatencyFrames: 480,
    outputChannels: 3,
    sampleRate: 48000,
    bufferFrames: 256,
  }))
  const view = mount()
  await ready(view)
  await choose(view, "Input device", "USB Mic")
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Input Config…" }))
  const inputConfig = within(view.getByRole("group", { name: "Input Config…" }))
  fireEvent.click(inputConfig.getByRole("checkbox", { name: "3 · Mic C" }))
  fireEvent.click(inputConfig.getByRole("checkbox", { name: "3/4 · Mic C / Mic D" }))
  fireEvent.click(inputConfig.getByRole("checkbox", { name: "1/2 · Mic A / Mic B" }))
  fireEvent.click(view.getByRole("button", { name: "Output Config…" }))
  const outputConfig = within(view.getByRole("group", { name: "Output Config…" }))
  fireEvent.click(outputConfig.getByRole("checkbox", { name: "1 · Out A" }))
  fireEvent.click(outputConfig.getByRole("checkbox", { name: "3/4 · Out C / Out D" }))
  fireEvent.click(outputConfig.getByRole("checkbox", { name: "1/2 · Out A / Out B" }))
  await choose(view, "Requested sample rate", "96,000 Hz")
  await choose(view, "Requested buffer size", "192 frames")
  expect(view.getByRole("note").textContent).toContain("interrupt other apps")
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole("button", { name: "Apply" }))
  await waitFor(() =>
    expect(nativeAudio.configureDevice).toHaveBeenCalledWith({
      host: "CoreAudio",
      inputDeviceId: microphone.id,
      outputDeviceId: input.id,
      sampleRate: 96000,
      bufferFrames: 192,
      inputMono: [2],
      inputStereo: [2],
      outputMono: [0],
      outputStereo: [2],
    })
  )
  await view.findByText("Configuration acknowledged by the audio engine")
  const actual = within(view.getByLabelText("Actual native configuration"))
  expect(actual.getByText("48,000 Hz")).toBeTruthy()
  expect(actual.getByText("96,000 Hz")).toBeTruthy()
  expect(actual.getByText("256 frames")).toBeTruthy()
  expect(actual.getByText("192 frames")).toBeTruthy()
  expect(actual.getByText("15.00 ms")).toBeTruthy()
  expect(readNativeAudioStatus().device?.bufferFrames).toBe(256)
})

it("keeps native actual values and the editable draft when Apply fails", async () => {
  vi.mocked(nativeAudio.configureDevice).mockRejectedValue(
    new Error("Microphone permission pending; grant permission and retry")
  )
  const view = mount()
  await ready(view)
  await choose(view, "Requested buffer size", "192 frames")
  fireEvent.click(view.getByRole("button", { name: "Apply" }))
  expect((await view.findByRole("alert")).textContent).toContain("Microphone permission pending")
  expect(readNativeAudioStatus().device).toBe(snapshot)
  expect(view.getByRole("button", { name: "Requested buffer size" }).textContent).toContain(
    "192 frames"
  )
  expect(
    within(view.getByLabelText("Actual native configuration")).getAllByText("512 frames")
  ).toHaveLength(2)
  expect(view.getByText("Ready")).toBeTruthy()
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Refresh devices" }))
  await ready(view)
  expect(view.getByRole("button", { name: "Requested buffer size" }).textContent).toContain(
    "192 frames"
  )
})

it("requires an enabled output channel and shows the real driver panel only when supported", async () => {
  vi.mocked(nativeAudio.devices).mockResolvedValue({
    ...snapshot,
    capabilities: { ...snapshot.capabilities, controlPanel: true },
  })
  const view = mount()
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Driver settings…" }))
  await waitFor(() => expect(nativeAudio.openDeviceControlPanel).toHaveBeenCalledTimes(1))
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Output Config…" }))
  fireEvent.click(view.getByRole("checkbox", { name: "1/2 · Out A / Out B" }))
  expect(view.getByRole("button", { name: "Apply" }).hasAttribute("disabled")).toBe(true)
  expect(
    view.getByText("Enable at least one mono output channel or stereo output pair before applying.")
  ).toBeTruthy()
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
})

it.each([
  ["refresh", "Refresh devices"],
  ["apply", "Apply"],
  ["panel", "Driver settings…"],
])("ignores the late %s snapshot after the settings page unmounts", async (_operation, button) => {
  vi.mocked(nativeAudio.devices).mockResolvedValue({
    ...snapshot,
    capabilities: { ...snapshot.capabilities, controlPanel: true },
  })
  const view = mount()
  await ready(view)
  const actual = readNativeAudioStatus().device
  let resolveLate = (_value: AudioDeviceSnapshot): void => {
    throw new Error("No pending device operation")
  }
  const late = new Promise<AudioDeviceSnapshot>(resolve => {
    resolveLate = resolve
  })
  vi.mocked(nativeAudio.devices).mockReturnValue(late)
  vi.mocked(nativeAudio.configureDevice).mockReturnValue(late)
  vi.mocked(nativeAudio.openDeviceControlPanel).mockReturnValue(late)

  fireEvent.click(view.getByRole("button", { name: button }))
  expect(view.getByRole("button", { name: "Refresh devices" }).hasAttribute("disabled")).toBe(true)
  view.unmount()
  await act(async () => resolveLate({ ...snapshot, deviceName: "Late device" }))
  expect(readNativeAudioStatus().device).toBe(actual)
})

it("rejects capabilities belonging to a different device without applying the draft", async () => {
  vi.mocked(nativeAudio.deviceCapabilities).mockResolvedValue({
    ...capabilities(configuration),
    outputDeviceId: output.id,
  })
  const view = mount()
  expect((await view.findByRole("alert")).textContent).toContain(
    "The driver returned capabilities for a different device"
  )
  expect(view.getByRole("button", { name: "Apply" }).hasAttribute("disabled")).toBe(true)
  expect(readNativeAudioStatus().device).toBe(snapshot)
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
})

it("keeps coupled input choices tied to the output and clears input when the output lacks it", async () => {
  vi.mocked(nativeAudio.devices).mockResolvedValue({
    ...snapshot,
    hosts: snapshot.hosts.map(host => ({ ...host, separateInputOutput: false })),
  })
  const view = mount()
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Input device" }))
  expect(view.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["No input", "E2"])
  fireEvent.click(view.getByRole("menuitem", { name: "E2" }))
  await ready(view)
  await choose(view, "Output device", "Alt")
  await ready(view)
  expect(view.getByRole("button", { name: "Input device" }).textContent).toContain("No input")
  fireEvent.click(view.getByRole("button", { name: "Apply" }))
  await waitFor(() =>
    expect(nativeAudio.configureDevice).toHaveBeenCalledWith({
      ...configuration,
      outputDeviceId: output.id,
      inputDeviceId: null,
      inputMono: [],
      inputStereo: [],
    })
  )
})
