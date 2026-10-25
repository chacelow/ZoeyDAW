import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { initI18n } from "@zoeymind/i18n"
import { appLocales } from "@/locales"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { publishNativeAudioStatus } from "@/shared/native/audio"
import { TrackRouting } from "."
import { InputChannelRow, InputTypeRow } from "./InputRows"
import { hydrateProject, useProjectState } from "@/pages/project/adapters"
import type { AudioDeviceSnapshot } from "@/shared/native/audio"
import { createMeterStore, type MeterSession } from "@zoeydaw/project-runtime/realtime"
import {
  HEADER_BYTES,
  RECORD_BYTES,
  MAGIC,
  VERSION,
  writeHeader,
  writeRecord,
} from "@zoeydaw/project-core/realtime"
import { publishProjectMeters, readProjectMeters } from "@/pages/project/adapters/realtime"

function inputMeters() {
  const store = createMeterStore()
  store.bindStream(7, "routing-input")
  store.acceptRegistry(
    {
      sessionId: "routing-input",
      sessionEpoch: 1,
      deviceEpoch: 1,
      generation: 1,
      registryRevision: 1,
      resetEpoch: 0,
      entries: [0, 1].map(slotId => ({
        slotId,
        endpointId: `input/device/${slotId}`,
        kind: "input",
        ownerId: "device",
        channelIndex: 0,
        channelCount: 1,
        capabilities: ["peak"],
      })),
      sources: [],
      endpointResets: [0, 1].map(slotId => ({
        endpointId: `input/device/${slotId}`,
        slotIds: [slotId],
        slotResetEpoch: 0,
      })),
    },
    7
  )
  const session: MeterSession = {
    store,
    ready: Promise.resolve(),
    refresh: async () => {},
    tick() {},
    setVisible() {},
    reset: async () => ({ resetEpoch: 0, affected: [] }),
    readStatus: () => ({ state: "running", rateHz: 60, error: null }),
    subscribeStatus: () => () => {},
    readFrameAge: () => null,
    recordPaint() {},
    dispose: async () => {
      store.dispose()
    },
  }
  publishProjectMeters(session)
  let sequence = 0n
  return (levels: readonly number[]) => {
    const bytes = new ArrayBuffer(HEADER_BYTES + 2 * RECORD_BYTES)
    const view = new DataView(bytes)
    writeHeader(view, {
      magic: MAGIC,
      version: VERSION,
      headerBytes: HEADER_BYTES,
      generation: 1,
      registryRevision: 1,
      streamId: 7,
      slotCount: 2,
      seq: ++sequence,
      timeSamples: sequence * 256n,
      sampleRate: 48000,
      producedMonotonicNs: sequence,
      controlGeneration: 0n,
      acceptedRevision: 0n,
      audioRevision: 0n,
      subscriptionRevision: 1,
      flags: 0,
      timelineSample: 0n,
      timelineBeat: 0,
      tempoBpm: 120,
      deviceEpoch: 1,
      sourceCount: 0,
      resetEpoch: 0,
      frameType: 1,
    })
    levels.forEach((db, slotId) => {
      const peak = db <= -120 ? 0 : 10 ** (db / 20)
      writeRecord(
        view,
        {
          slotId,
          peak,
          rms: peak,
          hold: peak,
          sessionPeak: peak,
          blockEndSample: sequence * 256n,
          clipCount: 0n,
          flags: 1,
          validFrames: 256,
          slotResetEpoch: 0,
        },
        HEADER_BYTES + slotId * RECORD_BYTES
      )
    })
    store.acceptFrame(bytes)
  }
}

afterEach(() => {
  cleanup()
  readProjectMeters()?.store.dispose()
  publishProjectMeters(null)
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

it("updates every open input-channel meter as levels rise, fall and stop, then follows the selected channel", async () => {
  await initI18n(appLocales).changeLanguage("en-US")
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(item => item.kind === "audio")
  if (!track) throw new Error("Missing audio fixture")
  track.input = "external"
  track.inputChannel = "1"
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  const trackId = track.id
  const publishInput = inputMeters()
  function InputSelector() {
    const current = useProjectState(state =>
      state.document.tracks.find(item => item.id === trackId)
    )
    if (!current) throw new Error("Missing audio track")
    return (
      <InputChannelRow
        track={current}
        hardwareInputs={[
          { id: "1-2", label: "1 / 2" },
          { id: "1", label: "1" },
          { id: "2", label: "2" },
        ]}
      />
    )
  }
  const view = render(<InputSelector />)
  const trigger = view.getByRole("button")
  const heights = (element: HTMLElement) =>
    Array.from(
      element.querySelectorAll<HTMLElement>("span[style]"),
      element => 100 - Number.parseFloat(element.style.clipPath.replace("inset(", ""))
    )
  const assertLevels = (element: HTMLElement, left: number, right: number) => {
    const values = heights(element)
    expect(values).toHaveLength(2)
    expect(values[0]).toBeCloseTo(left)
    expect(values[1]).toBeCloseTo(right)
  }
  act(() => publishInput([-48, -12]))
  fireEvent.click(trigger)
  const menu = await screen.findByRole("menu")
  const mono1 = within(menu).getByRole("menuitem", { name: "1" })
  const mono2 = within(menu).getByRole("menuitem", { name: "2" })
  const stereo = within(menu).getByRole("menuitem", { name: "1 / 2" })
  await waitFor(() => assertLevels(mono1, 18.1818, 18.1818))
  assertLevels(mono2, 72.7273, 72.7273)
  assertLevels(stereo, 18.1818, 72.7273)
  act(() => publishInput([-6, -54]))
  expect(screen.getByRole("menu")).toBe(menu)
  await waitFor(() => assertLevels(mono1, 81.8182, 81.8182))
  assertLevels(mono2, 9.0909, 9.0909)
  assertLevels(stereo, 81.8182, 9.0909)
  fireEvent.click(mono2)
  expect(
    useProjectState.getState().document.tracks.find(item => item.id === trackId)?.inputChannel
  ).toBe("2")
  act(() => publishInput([-54, -6]))
  await waitFor(() => assertLevels(trigger, 81.8182, 81.8182))
  act(() => publishInput([-120, -120]))
  await waitFor(() => assertLevels(trigger, 0, 0))
})

it("persists an enabled input channel when a track without a channel switches to external input", async () => {
  await initI18n(appLocales).changeLanguage("en-US")
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(item => item.kind === "audio")
  if (!track) throw new Error("Missing audio track")
  track.input = "none"
  delete track.inputChannel
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
  const view = render(
    <InputTypeRow track={track} hardwareInputs={[{ id: "3-4", label: "3 / 4" }]} />
  )
  fireEvent.click(view.getByRole("button"))
  fireEvent.click(await screen.findByRole("menuitem", { name: "Ext. In" }))
  expect(
    useProjectState.getState().document.tracks.find(item => item.id === track.id)
  ).toMatchObject({ input: "external", inputChannel: "3-4" })
})
