import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider } from "@/platform/frame"
import { useProjectState } from "@/project/stores/useProjectState"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { LevelMeter, meterPosition } from "@/ui/controls/LevelMeter"
import { TrackLabelsProvider } from "../labels"
import { createTrackLabels } from "@/app/locales/sections/tracks"
import { createControlledFrames } from "../verification/frame-source"
import { TrackTelemetryProvider, useInputChannelMeter } from "./telemetry"
import { TrackMeter } from "./TrackMeter"
import type { BackendTelemetry } from "@/project/model/backend"
import type { TestRoot } from "@gpuix/react/testing"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})
const policy = ARRANGEMENT_DEFAULTS.meter
const scale = DEFAULT_DESIGN_TOKENS.editor.meter.scale
const height = 132

function frame(levels: BackendTelemetry["levels"]): BackendTelemetry {
  return {
    sessionId: "meter-test",
    sequence: 1,
    appliedSequence: 1,
    playing: false,
    recording: false,
    clock: { kind: "musical", bar: 1, barsPerSecond: 0.5 },
    levels,
    inputLevels: {},
    outputLatencyFrames: null,
  }
}

function mountMeter(readTelemetry: () => BackendTelemetry | null, id = "audio") {
  const frames = createControlledFrames()
  const root = createTestRoot({ width: 120, height: 160 })
  roots.push(root)
  const render = () =>
    root.render(
      <AnimationFrameProvider source={frames.source}>
        <ThemeProvider>
          <TrackLabelsProvider labels={createTrackLabels("en-US")}>
            <TrackTelemetryProvider telemetry={() => readTelemetry()}>
              <TrackMeter trackId={id} trackName="Audio" height={height} />
            </TrackTelemetryProvider>
          </TrackLabelsProvider>
        </ThemeProvider>
      </AnimationFrameProvider>
    )
  render()
  const advance = (timestampMs: number) => {
    flushSync(() => frames.advance(timestampMs))
    root.renderer.flush()
  }
  return { root, frames, render, advance }
}

test("telemetry preserves distinct RMS and instantaneous peak while hold releases overload", () => {
  let telemetry: BackendTelemetry | null = null
  const view = mountMeter(() => telemetry)
  expect(view.frames.subscribers).toBe(0)
  telemetry = frame({ audio: { peak: [-12, 3], rms: [-24, -9] } })
  view.render()
  view.advance(0)
  expect(view.root.renderer.findByTestId("track-meter-rms-left-audio")?.style.top).toBeCloseTo(
    meterPosition(-24, scale) * height
  )
  expect(view.root.renderer.findByTestId("track-meter-peak-left-audio")?.style.top).toBeCloseTo(
    meterPosition(-12, scale) * height
  )
  expect(view.root.renderer.findByTestId("track-meter-clip-right-audio")).toBeDefined()
  telemetry = frame({
    audio: { peak: [policy.minDb, policy.minDb], rms: [policy.minDb, policy.minDb] },
  })
  view.render()
  view.advance(policy.holdMs)
  expect(view.root.renderer.findByTestId("track-meter-peak-right-audio")?.style.top).toBe(
    view.root.renderer.findByTestId("track-meter-rms-right-audio")?.style.top
  )
  expect(view.root.renderer.findByTestId("track-meter-clip-right-audio")).toBeDefined()
  view.advance(policy.holdMs + 1000)
  expect(view.root.renderer.findByTestId("track-meter-hold-right-audio")?.style.top).toBeCloseTo(
    meterPosition(3 - policy.fallDbPerSecond, scale) * height
  )
  expect(view.root.renderer.findByTestId("track-meter-clip-right-audio")).toBeUndefined()
  view.advance(policy.holdMs + 12000)
  expect(view.root.renderer.findByTestId("track-meter-hold-right-audio")).toBeUndefined()
  expect(view.frames.subscribers).toBe(0)
})

test("missing track telemetry stays silent without frame demand", () => {
  const view = mountMeter(() => frame({ other: { peak: [6, 6], rms: [0, 0] } }), "missing")
  expect(view.root.renderer.findByTestId("track-meter-rms-left-missing")?.style.top).toBe(height)
  expect(view.root.renderer.findByTestId("track-meter-hold-left-missing")).toBeUndefined()
  expect(view.frames.subscribers).toBe(0)
})

test("resume reads the newest telemetry from idle and stopped holds catch up", () => {
  const previousSession = useProjectState.getState().session
  useProjectState.setState({ session: { ...previousSession, playing: true } })
  let telemetry = frame({ audio: { peak: [-120, -120], rms: [-120, -120] } })
  const view = mountMeter(() => telemetry)
  try {
    expect(view.frames.subscribers).toBe(0)
    telemetry = {
      ...frame({ audio: { peak: [-38, -41], rms: [-45, -49] } }),
      sequence: 10529,
      playing: true,
    }
    view.frames.resume(5500)
    expect(
      view.root.renderer.findByTestId("track-meter-audio")?.customProps?.["aria-valuetext"]
    ).toBe("L -38.0 dB, R -41.0 dB")
    expect(view.root.renderer.findByTestId("track-meter-rms-left-audio")?.style.top).toBeCloseTo(
      meterPosition(-45, scale) * height
    )
    useProjectState.setState({ session: { ...useProjectState.getState().session, playing: false } })
    telemetry = frame({ audio: { peak: [-120, -120], rms: [-120, -120] } })
    view.render()
    view.frames.resume(12000)
    expect(view.root.renderer.findByTestId("track-meter-hold-left-audio")).toBeUndefined()
    expect(view.frames.subscribers).toBe(0)
    expect(view.frames.resumeSubscribers).toBe(0)
  } finally {
    useProjectState.setState({ session: previousSession })
  }
})

test("input channel hook reads input telemetry and advances the shared meter driver", () => {
  const frames = createControlledFrames()
  const root = createTestRoot({ width: 120, height: 160 })
  roots.push(root)
  let telemetry = frame({})
  function InputMeterHarness() {
    const channels = useInputChannelMeter("1")
    return (
      <LevelMeter
        variant="inline"
        height={height}
        minDb={policy.minDb}
        maxDb={policy.maxDb}
        channels={channels}
        testId={part => `input-test-${part}`}
      />
    )
  }
  root.render(
    <AnimationFrameProvider source={frames.source}>
      <ThemeProvider>
        <TrackTelemetryProvider telemetry={() => telemetry}>
          <InputMeterHarness />
        </TrackTelemetryProvider>
      </ThemeProvider>
    </AnimationFrameProvider>
  )
  telemetry = { ...telemetry, inputLevels: { "1": { peak: [-6, -6], rms: [-12, -12] } } }
  flushSync(() => frames.advance(16))
  root.renderer.flush()
  expect(root.renderer.findByTestId("input-test-peak-left")).toBeDefined()
  expect(root.renderer.findByTestId("input-test-rms-left")).toBeDefined()
})
