import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider } from "@/platform/frame"
import { useProjectState } from "@/project/stores/useProjectState"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { TrackLabelsProvider } from "../labels"
import { trackResources } from "../locales"
import { createControlledFrames } from "../verification/frame-source"
import { TrackTelemetryProvider } from "./telemetry"
import { TrackMeter } from "./TrackMeter"
import type { BackendTelemetry } from "@/project/model/backend"
import type { TestRoot } from "@gpuix/react/testing"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

function frame(levels: BackendTelemetry["levels"]): BackendTelemetry {
  return {
    sessionId: "meter-test",
    sequence: 1,
    appliedSequence: 1,
    playing: false,
    recording: false,
    clock: { kind: "musical", bar: 1, barsPerSecond: 0.5 },
    levels,
    outputLatencyFrames: null,
  }
}

function mountMeter(
  readTelemetry: () => BackendTelemetry | null,
  id = "audio",
  language: "en-US" | "zh-CN" = "en-US"
) {
  const frames = createControlledFrames()
  const root = createTestRoot({ width: 120, height: 160 })
  roots.push(root)
  const render = () =>
    root.render(
      <AnimationFrameProvider source={frames.source}>
        <ThemeProvider>
          <TrackLabelsProvider labels={trackResources[language].arrangement}>
            <TrackTelemetryProvider telemetry={() => readTelemetry()}>
              <TrackMeter
                trackId={id}
                trackName={language === "zh-CN" ? "音频" : "Audio"}
                height={132}
              />
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
  const close = () => {
    const index = roots.indexOf(root)
    if (index === -1) return
    roots.splice(index, 1)
    root.unmount()
  }
  return { root, frames, render, advance, close }
}

test("production frame bridge renders stereo overload, holds peaks and stops after silence", () => {
  let telemetry: BackendTelemetry | null = null
  const view = mountMeter(() => telemetry)
  const meter = () => {
    const found = view.root.renderer.findByTestId("track-meter-audio")
    if (!found) throw new Error("Missing meter")
    return found
  }
  expect(meter().customProps?.["aria-valuetext"]).toBe("L -60.0 dB, R -60.0 dB")
  expect(view.frames.subscribers).toBe(0)
  telemetry = frame({ audio: [-12, 3] })
  view.render()
  expect(view.frames.subscribers).toBe(1)
  view.advance(0)
  expect(meter().customProps?.["aria-valuetext"]).toBe("L -12.0 dB, R 3.0 dB")
  const zero = view.root.renderer.findByTestId("track-meter-zero-audio")
  expect(zero?.style.backgroundColor).toBe(meter().style.backgroundColor)
  expect(zero?.style.top).toBe(12)
  expect(view.root.renderer.findByTestId("track-meter-floor-right-audio")?.style.height).toBe(6)
  telemetry = frame({ audio: [-120, -120] })
  view.render()
  view.advance(600)
  expect(meter().customProps?.["aria-valuetext"]).toBe("L -60.0 dB, R -60.0 dB")
  expect(view.root.renderer.findByTestId("track-meter-peak-right-audio")?.style.top).toBe(6)
  view.advance(1600)
  expect(view.root.renderer.findByTestId("track-meter-peak-right-audio")?.style.top).toBe(54)
  view.advance(4000)
  expect(view.root.renderer.findByTestId("track-meter-peak-right-audio")).toBeUndefined()
  expect(view.frames.subscribers).toBe(0)
})

test("missing track telemetry stays at floor without starting native frame subscriptions", () => {
  const view = mountMeter(() => frame({ unrelated: [6, 6] }), "missing", "zh-CN")
  const meter = view.root.renderer.findByTestId("track-meter-missing")
  expect(meter?.customProps?.["aria-valuetext"]).toBe("L -60.0 dB, R -60.0 dB")
  expect(meter?.customProps?.["aria-label"]).toBe("电平表 音频")
  expect(view.root.renderer.findByTestId("track-meter-peak-left-missing")).toBeUndefined()
  expect(view.frames.subscribers).toBe(0)
})

test("inline reader changes preserve held peaks and unmount cancels the real frame bridge", () => {
  let telemetry = frame({ audio: [3, 0] })
  const view = mountMeter(() => telemetry)
  expect(view.frames.subscribers).toBe(1)
  view.advance(0)
  expect(view.root.renderer.findByTestId("track-meter-peak-left-audio")?.style.top).toBe(6)
  telemetry = frame({ audio: [-120, -120] })
  view.render()
  view.advance(100)
  expect(view.root.renderer.findByTestId("track-meter-peak-left-audio")?.style.top).toBe(6)
  expect(
    view.root.renderer.findByTestId("track-meter-audio")?.customProps?.["aria-valuetext"]
  ).toBe("L -60.0 dB, R -60.0 dB")
  view.close()
  expect(view.frames.subscribers).toBe(0)
})

test("first resume commits newest stereo telemetry even when the decay driver was idle", () => {
  const previousSession = useProjectState.getState().session
  useProjectState.setState({ session: { ...previousSession, playing: true } })
  let telemetry = frame({ audio: [-120, -120] })
  const view = mountMeter(() => telemetry)
  try {
    expect(view.frames.subscribers).toBe(0)
    expect(view.frames.resumeSubscribers).toBe(1)
    expect(
      view.root.renderer.findByTestId("track-meter-audio")?.customProps?.["aria-valuetext"]
    ).toBe("L -60.0 dB, R -60.0 dB")
    // No ordinary frame or provider rerender occurs while the window is hidden.
    telemetry = { ...frame({ audio: [-38, -41] }), sequence: 10529, playing: true }
    view.frames.resume(5500)
    expect(
      view.root.renderer.findByTestId("track-meter-audio")?.customProps?.["aria-valuetext"]
    ).toBe("L -38.0 dB, R -41.0 dB")
  } finally {
    view.close()
    useProjectState.setState({ session: previousSession })
  }
})

test("stopped held peaks catch up on resume and release all frame demand after decay", () => {
  const previousSession = useProjectState.getState().session
  useProjectState.setState({ session: { ...previousSession, playing: true } })
  let telemetry = frame({ audio: [3, 0] })
  const view = mountMeter(() => telemetry)
  try {
    view.advance(0)
    expect(view.root.renderer.findByTestId("track-meter-peak-left-audio")).toBeDefined()
    useProjectState.setState({ session: { ...useProjectState.getState().session, playing: false } })
    telemetry = frame({ audio: [-120, -120] })
    view.render()
    // Playback stopped, but the held peak still needs elapsed-time decay after occlusion.
    view.frames.resume(5000)
    expect(view.root.renderer.findByTestId("track-meter-peak-left-audio")).toBeUndefined()
    expect(view.root.renderer.findByTestId("track-meter-peak-right-audio")).toBeUndefined()
    expect(
      view.root.renderer.findByTestId("track-meter-audio")?.customProps?.["aria-valuetext"]
    ).toBe("L -60.0 dB, R -60.0 dB")
    expect(view.frames.subscribers).toBe(0)
    expect(view.frames.resumeSubscribers).toBe(0)
  } finally {
    view.close()
    useProjectState.setState({ session: previousSession })
  }
})
