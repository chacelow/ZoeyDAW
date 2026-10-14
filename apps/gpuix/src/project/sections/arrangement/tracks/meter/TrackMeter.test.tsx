import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { ThemeProvider } from "../../../../../shared/theme/ThemeProvider"
import { TrackLabelsProvider } from "../labels"
import { trackResources } from "../locales"
import { createMeterDecayDriver } from "./decay-driver"
import { TrackTelemetryProvider } from "./telemetry"
import { TrackMeter } from "./TrackMeter"
import type { BackendTelemetry } from "../../../../model/backend"
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

test("accepted stereo telemetry drives overload, card cutouts and held peaks after stop", () => {
  let time = 0
  let telemetry: BackendTelemetry | null = null
  const callbacks = new Set<() => void>()
  const driver = createMeterDecayDriver(
    {
      subscribe(callback) {
        callbacks.add(callback)
        return () => {
          callbacks.delete(callback)
        }
      },
    },
    () => time
  )
  const root = createTestRoot({ width: 120, height: 160 })
  roots.push(root)
  root.render(
    <ThemeProvider>
      <TrackLabelsProvider labels={trackResources["en-US"].arrangement}>
        <TrackTelemetryProvider telemetry={() => telemetry}>
          <TrackMeter trackId="audio" trackName="Audio" height={132} driver={driver} />
        </TrackTelemetryProvider>
      </TrackLabelsProvider>
    </ThemeProvider>
  )
  root.renderer.flush()
  const meter = () => {
    const found = root.renderer.findByTestId("track-meter-audio")
    if (!found) throw new Error("Missing meter")
    return found
  }
  expect(meter().customProps?.["aria-valuetext"]).toBe("L -60.0 dB, R -60.0 dB")
  expect(callbacks.size).toBe(0)
  telemetry = frame({ audio: [-12, 3] })
  flushSync(() => driver.wake())
  root.renderer.flush()
  expect(meter().customProps?.["aria-valuetext"]).toBe("L -12.0 dB, R 3.0 dB")
  const zero = root.renderer.findByTestId("track-meter-zero-audio")
  expect(zero?.style.backgroundColor).toBe(meter().style.backgroundColor)
  expect(zero?.style.top).toBe(12)
  expect(root.renderer.findByTestId("track-meter-floor-right-audio")?.style.height).toBe(6)
  expect(root.renderer.findByTestId("track-meter-peak-right-audio")?.style.top).toBe(6)
  telemetry = frame({ audio: [-120, -120] })
  time = 600
  flushSync(() => {
    for (const callback of callbacks) callback()
  })
  root.renderer.flush()
  expect(meter().customProps?.["aria-valuetext"]).toBe("L -60.0 dB, R -60.0 dB")
  expect(root.renderer.findByTestId("track-meter-peak-right-audio")?.style.top).toBe(6)
  time = 1600
  flushSync(() => {
    for (const callback of callbacks) callback()
  })
  root.renderer.flush()
  expect(root.renderer.findByTestId("track-meter-peak-right-audio")?.style.top).toBe(54)
  time = 4000
  flushSync(() => {
    for (const callback of callbacks) callback()
  })
  root.renderer.flush()
  expect(root.renderer.findByTestId("track-meter-peak-right-audio")).toBeUndefined()
  expect(callbacks.size).toBe(0)
})

test("missing track telemetry remains silent instead of displaying another track's levels", () => {
  const root = createTestRoot({ width: 120, height: 160 })
  roots.push(root)
  const telemetry = frame({ unrelated: [6, 6] })
  const callbacks = new Set<() => void>()
  const driver = createMeterDecayDriver(
    {
      subscribe(callback) {
        callbacks.add(callback)
        return () => {
          callbacks.delete(callback)
        }
      },
    },
    () => 0
  )
  root.render(
    <ThemeProvider>
      <TrackLabelsProvider labels={trackResources["zh-CN"].arrangement}>
        <TrackTelemetryProvider telemetry={() => telemetry}>
          <TrackMeter trackId="missing" trackName="音频" height={66} driver={driver} />
        </TrackTelemetryProvider>
      </TrackLabelsProvider>
    </ThemeProvider>
  )
  root.renderer.flush()
  const meter = root.renderer.findByTestId("track-meter-missing")
  expect(meter?.customProps?.["aria-valuetext"]).toBe("L -60.0 dB, R -60.0 dB")
  expect(meter?.customProps?.["aria-label"]).toBe("电平表 音频")
  expect(root.renderer.findByTestId("track-meter-peak-left-missing")).toBeUndefined()
  expect(callbacks.size).toBe(0)
})
