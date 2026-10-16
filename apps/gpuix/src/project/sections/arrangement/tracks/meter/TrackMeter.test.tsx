import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider } from "@/platform/frame"
import { useProjectState } from "@/project/stores/useProjectState"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import { TrackLabelsProvider } from "../labels"
import { createTrackLabels } from "@/app/locales/sections/tracks"
import { createControlledFrames } from "../verification/frame-source"
import { TrackTelemetryProvider } from "./telemetry"
import { TrackMeter } from "./TrackMeter"
import type { BackendTelemetry } from "@/project/model/backend"
import type { TestRoot } from "@gpuix/react/testing"
import { createDisplayFormats } from "@/app/i18n/display-formats"
import { displayConfigByLocale } from "@/app/locales/display"
import type { TrackLabels } from "../labels"

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
  language: "en-US" | "zh-CN" = "en-US",
  design: DesignTokens = DEFAULT_DESIGN_TOKENS,
  labels: TrackLabels = createTrackLabels(language)
) {
  const frames = createControlledFrames()
  const root = createTestRoot({ width: 120, height: 160 })
  roots.push(root)
  const render = () =>
    root.render(
      <AnimationFrameProvider source={frames.source}>
        <ThemeProvider design={design}>
          <TrackLabelsProvider labels={labels}>
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
  expect(view.root.renderer.findByTestId("track-meter-floor-left-missing")?.style.height).toBe(132)
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

test("stopping playback preserves peak hold then gradually decays to floor", () => {
  const previousSession = useProjectState.getState().session
  useProjectState.setState({ session: { ...previousSession, playing: true } })
  let telemetry = { ...frame({ audio: [3, 0] }), playing: true }
  const view = mountMeter(() => telemetry)
  const peakTop = () => view.root.renderer.findByTestId("track-meter-peak-left-audio")?.style.top
  try {
    view.advance(0)
    expect(peakTop()).toBe(6)
    telemetry = frame({ audio: [-120, -120] })
    flushSync(() => {
      useProjectState.setState({
        session: { ...useProjectState.getState().session, playing: false },
      })
    })
    view.advance(600)
    expect(peakTop()).toBe(6)
    expect(view.frames.subscribers).toBe(1)
    view.advance(1600)
    expect(peakTop()).toBe(54)
    view.advance(2000)
    expect(peakTop()).toBe(73)
    view.advance(4000)
    expect(peakTop()).toBeUndefined()
    expect(view.frames.subscribers).toBe(0)
  } finally {
    view.close()
    useProjectState.setState({ session: previousSession })
  }
})

test("native meter channels, peak, zero line and warning gradient consume design metrics", () => {
  const design = {
    ...DEFAULT_DESIGN_TOKENS,
    editor: {
      ...DEFAULT_DESIGN_TOKENS.editor,
      meter: { channelGap: 3, peakWidth: 4, zeroWidth: 2, warningStop: 0.65 },
    },
  }
  const view = mountMeter(() => frame({ audio: [3, 0] }), "audio", "en-US", design)
  view.advance(0)
  const node = (id: string) => {
    const found = view.root.renderer.findByTestId(id)
    if (!found) throw new Error(`Missing ${id}`)
    return found
  }
  const bounds = (id: string) => {
    const nativeId = node(id).id
    const measured = view.root.renderer.getElementBounds(nativeId)
    if (!measured) throw new Error(`Missing native bounds for ${id}`)
    return measured
  }
  const left = bounds("track-meter-left-audio")
  const right = bounds("track-meter-right-audio")
  expect(left.width).toBe(5)
  expect(right.x - left.x - left.width).toBe(3)
  expect(right.width).toBe(5)
  expect(bounds("track-meter-peak-left-audio").height).toBe(4)
  expect(bounds("track-meter-zero-audio").height).toBe(2)
  expect(node("track-meter-gradient-left-audio").style.background).toMatchObject({
    type: "linear-gradient",
    angle: 180,
    stops: [{ position: 0 }, { position: 0.65 }],
  })
})

test("native meter readout follows the injected numeric display policy", () => {
  const config = structuredClone(displayConfigByLocale["en-US"])
  config.precision.db = 2
  const labels = { ...createTrackLabels("en-US"), formats: createDisplayFormats("en-US", config) }
  const view = mountMeter(
    () => frame({ audio: [3, 0] }),
    "audio",
    "en-US",
    DEFAULT_DESIGN_TOKENS,
    labels
  )
  view.advance(0)
  expect(
    view.root.renderer.findByTestId("track-meter-audio")?.customProps?.["aria-valuetext"]
  ).toMatch(/3\.00.*0\.00/)
})
