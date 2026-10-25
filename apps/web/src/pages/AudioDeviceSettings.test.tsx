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
function acknowledged(request: AudioDeviceConfiguration): AudioDeviceSnapshot {
  return {
    ...(readNativeAudioStatus().device ?? snapshot),
    configuration: request,
    capabilities: capabilities(request),
    inputDeviceId: request.inputDeviceId,
    inputDeviceName: request.inputDeviceId === microphone.id ? microphone.name : null,
  }
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
  publishNativeAudioStatus({
    device: null,
    issues: [],
    error: null,
    recordingPreview: null,
  })
  vi.spyOn(nativeAudio, "available").mockReturnValue(true)
  vi.spyOn(nativeAudio, "devices").mockResolvedValue(snapshot)
  vi.spyOn(nativeAudio, "deviceCapabilities").mockImplementation(async request =>
    capabilities(request)
  )
  vi.spyOn(nativeAudio, "configureDevice").mockImplementation(async request =>
    acknowledged(request)
  )
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
    expect(
      view.getByRole("button", { name: "Requested buffer size" }).hasAttribute("disabled")
    ).toBe(false)
  )
}
async function configured(times: number) {
  await waitFor(() => expect(nativeAudio.configureDevice).toHaveBeenCalledTimes(times))
  await waitFor(() =>
    expect(readNativeAudioStatus().device?.configuration).toEqual(
      vi.mocked(nativeAudio.configureDevice).mock.calls[times - 1]?.[0]
    )
  )
  await waitFor(() =>
    expect(
      document.querySelector('[aria-label="Requested buffer size"]')?.hasAttribute("disabled")
    ).toBe(false)
  )
}

it("discovers on mount and opening a device selector without an Apply or Refresh action", async () => {
  const view = mount()
  await ready(view)
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
  expect(view.queryByRole("button", { name: "Apply" })).toBeNull()
  expect(view.queryByRole("button", { name: "Refresh devices" })).toBeNull()
  fireEvent.click(view.getByRole("button", { name: "Output device" }))
  await waitFor(() => expect(nativeAudio.devices).toHaveBeenCalledTimes(2))
  await ready(view)
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole("button", { name: "Output device" }))
  fireEvent.click(view.getByRole("button", { name: "Requested buffer size" }))
  expect(view.getAllByRole("menuitem").map(item => item.textContent)).toEqual([
    "192 frames",
    "512 frames",
  ])
  fireEvent.click(view.getByRole("menuitem", { name: "192 frames" }))
  await configured(1)
  expect(nativeAudio.configureDevice).toHaveBeenCalledWith({ ...configuration, bufferFrames: 192 })
  const actual = within(view.getByLabelText("Device status and latency"))
  expect(actual.getByText("512 frames")).toBeTruthy()
  expect(actual.queryByText("192 frames")).toBeNull()
  expect(actual.getAllByText("5.00 ms")).toHaveLength(2)
})

it("ignores a late capability response for a superseded device", async () => {
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
  fireEvent.click(view.getByRole("button", { name: "Requested buffer size" }))
  expect(view.getAllByRole("menuitem").map(item => item.textContent)).toEqual([
    "192 frames",
    "512 frames",
  ])
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
})

it("fits changed-device capabilities before writing and only sends supported values", async () => {
  vi.mocked(nativeAudio.deviceCapabilities).mockImplementation(async request =>
    request.outputDeviceId === output.id
      ? {
          ...capabilities(request),
          sampleRates: [44100],
          bufferSizes: [64],
          defaultSampleRate: 44100,
          defaultBufferFrames: 64,
        }
      : capabilities(request)
  )
  const view = mount()
  await ready(view)
  await choose(view, "Output device", "Alt")
  await configured(1)
  expect(nativeAudio.configureDevice).toHaveBeenCalledWith({
    ...configuration,
    outputDeviceId: output.id,
    sampleRate: 44100,
    bufferFrames: 64,
  })
})

it("applies input device and channel selections immediately", async () => {
  const view = mount()
  await ready(view)
  await choose(view, "Input device", "USB Mic")
  await configured(1)
  fireEvent.click(view.getByRole("button", { name: "Input Config…" }))
  const inputConfig = within(view.getByRole("group", { name: "Input Config…" }))
  fireEvent.click(inputConfig.getByRole("checkbox", { name: "3 · Mic C" }))
  await configured(2)
  fireEvent.click(inputConfig.getByRole("checkbox", { name: "3/4 · Mic C / Mic D" }))
  await configured(3)
  fireEvent.click(inputConfig.getByRole("checkbox", { name: "1/2 · Mic A / Mic B" }))
  await configured(4)
  expect(nativeAudio.configureDevice).toHaveBeenLastCalledWith({
    ...configuration,
    inputDeviceId: microphone.id,
    inputMono: [2],
    inputStereo: [2],
  })
})

it("applies output mono and stereo masks immediately", async () => {
  const view = mount()
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Output Config…" }))
  const outputConfig = within(view.getByRole("group", { name: "Output Config…" }))
  fireEvent.click(outputConfig.getByRole("checkbox", { name: "1 · Out A" }))
  await configured(1)
  fireEvent.click(outputConfig.getByRole("checkbox", { name: "3/4 · Out C / Out D" }))
  await configured(2)
  fireEvent.click(outputConfig.getByRole("checkbox", { name: "1/2 · Out A / Out B" }))
  await configured(3)
  expect(nativeAudio.configureDevice).toHaveBeenLastCalledWith({
    ...configuration,
    outputMono: [0],
    outputStereo: [2],
  })
})

it("applies rate and buffer changes independently with no Apply action", async () => {
  const view = mount()
  await ready(view)
  await choose(view, "Requested sample rate", "96,000 Hz")
  await configured(1)
  expect(view.getByRole("note").textContent).toContain("interrupt other apps")
  await choose(view, "Requested buffer size", "192 frames")
  await configured(2)
  expect(nativeAudio.configureDevice).toHaveBeenLastCalledWith({
    ...configuration,
    sampleRate: 96000,
    bufferFrames: 192,
  })
})

it("rolls back a rejected request, reports the native error and permits retry", async () => {
  vi.mocked(nativeAudio.configureDevice).mockRejectedValueOnce(
    new Error("Microphone permission pending; grant permission and retry")
  )
  const view = mount()
  await ready(view)
  await choose(view, "Requested buffer size", "192 frames")
  expect((await view.findByRole("alert")).textContent).toContain("Microphone permission pending")
  expect(readNativeAudioStatus().device).toBe(snapshot)
  expect(view.getByRole("button", { name: "Requested buffer size" }).textContent).toContain(
    "512 frames"
  )
  await ready(view)
  await choose(view, "Requested buffer size", "192 frames")
  await configured(2)
  expect(view.queryByRole("alert")).toBeNull()
})

it("serializes configuration writes from overlapping settings views", async () => {
  let releaseFirst: (value: AudioDeviceSnapshot) => void = (_value: AudioDeviceSnapshot) => {
    throw new Error("No pending configuration")
  }
  const first = new Promise<AudioDeviceSnapshot>(resolve => {
    releaseFirst = resolve
  })
  vi.mocked(nativeAudio.configureDevice)
    .mockReturnValueOnce(first)
    .mockImplementationOnce(async request => acknowledged(request))
  const view = render(
    <I18nProvider resources={appLocales}>
      <AudioDeviceSettings />
      <AudioDeviceSettings />
    </I18nProvider>
  )
  await waitFor(() =>
    expect(
      view
        .getAllByRole("button", { name: "Requested buffer size" })
        .every(button => !button.hasAttribute("disabled"))
    ).toBe(true)
  )
  fireEvent.click(view.getAllByRole("button", { name: "Requested buffer size" })[0])
  fireEvent.click(view.getByRole("menuitem", { name: "192 frames" }))
  await waitFor(() => expect(nativeAudio.configureDevice).toHaveBeenCalledTimes(1))
  fireEvent.click(view.getAllByRole("button", { name: "Requested sample rate" })[1])
  fireEvent.click(view.getByRole("menuitem", { name: "96,000 Hz" }))
  expect(nativeAudio.configureDevice).toHaveBeenCalledTimes(1)
  await act(async () => releaseFirst(acknowledged({ ...configuration, bufferFrames: 192 })))
  await waitFor(() => expect(nativeAudio.configureDevice).toHaveBeenCalledTimes(2))
  expect(nativeAudio.configureDevice).toHaveBeenNthCalledWith(2, {
    ...configuration,
    sampleRate: 96000,
  })
})

it("does not send an invalid output mask and exposes a real driver panel only when supported", async () => {
  vi.mocked(nativeAudio.devices).mockResolvedValue({
    ...snapshot,
    capabilities: { ...snapshot.capabilities, controlPanel: true },
  })
  const view = mount()
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Open…" }))
  await waitFor(() => expect(nativeAudio.openDeviceControlPanel).toHaveBeenCalledTimes(1))
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Output Config…" }))
  fireEvent.click(view.getByRole("checkbox", { name: "1/2 · Out A / Out B" }))
  expect(view.getByText(/Enable at least one mono output channel/)).toBeTruthy()
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole("checkbox", { name: "1 · Out A" }))
  await configured(1)
  expect(nativeAudio.configureDevice).toHaveBeenCalledWith({
    ...configuration,
    outputMono: [0],
    outputStereo: [],
  })
})

it.each(["discovery", "configuration", "panel"])(
  "ignores an unmounted %s reply without publishing",
  async operation => {
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
    if (operation === "discovery")
      fireEvent.click(view.getByRole("button", { name: "Output device" }))
    else if (operation === "panel") fireEvent.click(view.getByRole("button", { name: "Open…" }))
    else await choose(view, "Requested buffer size", "192 frames")
    await waitFor(() =>
      expect(
        operation === "discovery"
          ? nativeAudio.devices
          : operation === "panel"
            ? nativeAudio.openDeviceControlPanel
            : nativeAudio.configureDevice
      ).toHaveBeenCalledTimes(operation === "discovery" ? 2 : 1)
    )
    view.unmount()
    await act(async () => resolveLate({ ...snapshot, deviceName: "Late device" }))
    expect(readNativeAudioStatus().device).toBe(actual)
  }
)

it("rejects a mismatched capability response without writing a configuration", async () => {
  vi.mocked(nativeAudio.deviceCapabilities).mockResolvedValue({
    ...capabilities(configuration),
    outputDeviceId: output.id,
  })
  const view = mount()
  expect((await view.findByRole("alert")).textContent).toContain(
    "The driver returned capabilities for a different device"
  )
  expect(readNativeAudioStatus().device).toBe(snapshot)
  expect(nativeAudio.configureDevice).not.toHaveBeenCalled()
})

it("keeps coupled input choices tied to the output and clears input on output change", async () => {
  vi.mocked(nativeAudio.devices).mockResolvedValue({
    ...snapshot,
    hosts: snapshot.hosts.map(host => ({ ...host, separateInputOutput: false })),
  })
  const view = mount()
  await ready(view)
  fireEvent.click(view.getByRole("button", { name: "Input device" }))
  expect(view.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["No input", "E2"])
  fireEvent.click(view.getByRole("menuitem", { name: "E2" }))
  await configured(1)
  await ready(view)
  await choose(view, "Output device", "Alt")
  await configured(2)
  expect(view.getByRole("button", { name: "Input device" }).textContent).toContain("No input")
  expect(nativeAudio.configureDevice).toHaveBeenLastCalledWith({
    ...configuration,
    outputDeviceId: output.id,
    inputDeviceId: null,
  })
})
