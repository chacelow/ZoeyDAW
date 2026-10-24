import { beforeEach, expect, it, vi } from "vitest"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  nativeAudio,
  type AudioDeviceCapabilities,
  type AudioDeviceConfiguration,
  type AudioDeviceSnapshot,
} from "./audio"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }))
const configuration: AudioDeviceConfiguration = {
  host: "CoreAudio",
  inputDeviceId: "CoreAudio::Input",
  outputDeviceId: "CoreAudio::Output",
  sampleRate: 48000,
  bufferFrames: 192,
  inputMono: [0, 2],
  inputStereo: [2],
  outputMono: [1],
  outputStereo: [0],
}
const capabilities: AudioDeviceCapabilities = {
  host: configuration.host,
  inputDeviceId: configuration.inputDeviceId,
  outputDeviceId: configuration.outputDeviceId,
  inputChannelNames: ["1", "2", "3", "4"],
  outputChannelNames: ["1", "2"],
  sampleRates: [48000, 96000],
  bufferSizes: [192, 512],
  defaultSampleRate: 48000,
  defaultBufferFrames: 512,
  separateInputOutput: true,
  controlPanel: false,
}
const input = {
  id: "CoreAudio::Input",
  name: "Input",
  host: "CoreAudio",
  inputChannels: 4,
  outputChannels: 0,
}
const output = {
  id: "CoreAudio::Output",
  name: "Output",
  host: "CoreAudio",
  inputChannels: 0,
  outputChannels: 2,
}
const snapshot: AudioDeviceSnapshot = {
  state: "ready",
  host: "CoreAudio",
  deviceId: output.id,
  deviceName: output.name,
  sampleRate: 48000,
  bufferFrames: 256,
  outputChannels: 2,
  devices: [input, output],
  hosts: [{ id: "CoreAudio", name: "CoreAudio", separateInputOutput: true, controlPanel: false }],
  inputDevices: [input],
  outputDevices: [output],
  configuration,
  capabilities,
  inputDeviceId: input.id,
  inputDeviceName: input.name,
  inputChannels: 3,
  inputLatencyFrames: 480,
  outputLatencyFrames: 240,
  error: null,
}
beforeEach(() => {
  vi.mocked(invoke).mockReset()
  vi.mocked(isTauri).mockReturnValue(true)
})

it("probes exact device capabilities without configuring or opening audio", async () => {
  const request = { host: "CoreAudio", inputDeviceId: input.id, outputDeviceId: output.id }
  vi.mocked(invoke).mockResolvedValueOnce(capabilities)
  expect(await nativeAudio.deviceCapabilities(request)).toEqual(capabilities)
  expect(invoke).toHaveBeenCalledExactlyOnceWith("playback_device_capabilities", { request })
})

it("sends the complete configuration and preserves requested versus actual native values", async () => {
  vi.mocked(invoke).mockResolvedValueOnce(snapshot)
  const result = await nativeAudio.configureDevice(configuration)
  expect(invoke).toHaveBeenCalledExactlyOnceWith("playback_configure_device", {
    request: configuration,
  })
  expect(result.configuration?.bufferFrames).toBe(192)
  expect(result.bufferFrames).toBe(256)
  expect(result.inputLatencyFrames).toBe(480)
  expect(result.outputLatencyFrames).toBe(240)
})

it("rejects legacy configuration fields, invalid channel masks, and nonfinite native capabilities", async () => {
  const legacy = { ...configuration, deviceId: output.id }
  await expect(nativeAudio.configureDevice(legacy)).rejects.toThrow()
  await expect(
    nativeAudio.configureDevice({ ...configuration, inputMono: [0, 0] })
  ).rejects.toThrow()
  await expect(
    nativeAudio.configureDevice({ ...configuration, outputStereo: [-1] })
  ).rejects.toThrow()
  await expect(
    nativeAudio.configureDevice({ ...configuration, sampleRate: Number.NaN })
  ).rejects.toThrow()
  await expect(nativeAudio.configureDevice({ ...configuration, bufferFrames: 0 })).rejects.toThrow()
  expect(invoke).not.toHaveBeenCalled()
  await expect(nativeAudio.deviceCapabilities(configuration)).rejects.toThrow()
  expect(invoke).not.toHaveBeenCalled()
  const request = { host: configuration.host, inputDeviceId: input.id, outputDeviceId: output.id }
  vi.mocked(invoke).mockResolvedValueOnce({
    ...capabilities,
    sampleRates: [Number.POSITIVE_INFINITY],
  })
  await expect(nativeAudio.deviceCapabilities(request)).rejects.toThrow()
  vi.mocked(invoke).mockResolvedValueOnce({ ...capabilities, syntheticLatency: 4 })
  await expect(
    nativeAudio.deviceCapabilities({
      host: configuration.host,
      inputDeviceId: input.id,
      outputDeviceId: output.id,
    })
  ).rejects.toThrow()
})

it("validates every nested device snapshot field and real driver panel acknowledgements", async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    ...snapshot,
    configuration: { ...configuration, persistedInWeb: true },
  })
  await expect(nativeAudio.devices()).rejects.toThrow()
  vi.mocked(invoke).mockResolvedValueOnce({
    ...snapshot,
    inputDevices: [{ ...input, inputChannels: -1 }],
  })
  await expect(nativeAudio.devices()).rejects.toThrow()
  vi.mocked(invoke).mockResolvedValueOnce({ ...snapshot, inputLatencyFrames: -1 })
  await expect(nativeAudio.devices()).rejects.toThrow()
  vi.mocked(invoke).mockResolvedValueOnce(snapshot)
  expect(await nativeAudio.openDeviceControlPanel()).toEqual(snapshot)
  expect(invoke).toHaveBeenLastCalledWith("playback_device_control_panel", undefined)
})
