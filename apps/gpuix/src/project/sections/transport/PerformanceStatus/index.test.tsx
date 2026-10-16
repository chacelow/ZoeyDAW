import { expect, test } from "bun:test"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { AnimationFrameProvider } from "@/platform/frame"
import {
  configureProjectBackend,
  hydrateProject,
  projectActions,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createMockProjectBackend } from "@/project/adapters/backend/mock"
import type { BackendTelemetry } from "@/project/model/backend"
import { createTestAnimationFrames } from "../../footer/verification/test-frame"
import { englishTransportLabels } from "../demo-labels"
import { PerformanceStatus } from "."

test("native-frame readout receives the first paused telemetry and later latency changes", () => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  let publishTelemetry: ((latencyFrames: number, sampleFrame: number) => void) | null = null
  const restore = configureProjectBackend(() => {
    const backend = createMockProjectBackend()
    return {
      ...backend,
      subscribe(listener) {
        let last: BackendTelemetry | null = null
        publishTelemetry = (latencyFrames, sampleFrame) => {
          if (!last || last.clock.kind !== "sample")
            throw new Error("No accepted sample telemetry fixture")
          last = {
            ...last,
            sequence: last.sequence + 1,
            outputLatencyFrames: latencyFrames,
            clock: {
              ...last.clock,
              frame: sampleFrame,
              bar: 1 + (sampleFrame / last.clock.sampleRate) * last.clock.barsPerSecond,
            },
          }
          listener(last)
        }
        return backend.subscribe(frame => {
          last = {
            ...frame,
            clock: {
              kind: "sample",
              bar: frame.clock.bar,
              barsPerSecond: frame.clock.barsPerSecond,
              frame: 0,
              sampleRate: 48000,
            },
            outputLatencyFrames: 240,
          }
          listener(last)
        })
      },
    }
  })
  const frames = createTestAnimationFrames()
  const root = createTestRoot({ width: 600, height: 300 })
  let release: (() => void) | null = null
  function changeTelemetry(latencyFrames: number, sampleFrame: number) {
    if (!publishTelemetry) throw new Error("Missing producer")
    publishTelemetry(latencyFrames, sampleFrame)
  }
  try {
    root.render(
      <ThemeProvider>
        <AnimationFrameProvider source={frames}>
          <PerformanceStatus labels={englishTransportLabels} />
        </AnimationFrameProvider>
      </ThemeProvider>
    )
    flushSync(() => {
      release = startProjectRuntime()
    })
    flushSync(() => frames.emit(16))
    expect(frames.subscriberCount).toBe(0)
    const trigger = root.renderer.findByTestId("transport-engine")
    if (!trigger) throw new Error("Missing telemetry trigger")
    root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
    flushSync(() => frames.emit(20))
    root.renderer.flush()
    expect(frames.subscriberCount).toBe(1)
    expect(root.renderer.getPaintedText().join(" ")).toContain("5.00 ms")
    expect(useProjectState.getState().session.playing).toBe(false)
    flushSync(() => changeTelemetry(480, 4800))
    flushSync(() => frames.emit(32))
    root.renderer.flush()
    expect(root.renderer.getPaintedText().join(" ")).toContain("10.00 ms")
    expect(root.renderer.getPaintedText().join(" ")).not.toContain("5.00 ms")
    flushSync(() => changeTelemetry(720, 96000))
    expect(root.renderer.getAllText().join(" ")).toContain("10.00 ms")
    frames.emitResume(48)
    expect(root.renderer.getAllText().join(" ")).toContain("15.00 ms")
    expect(root.renderer.getAllText().join(" ")).toContain("0:00:02.000")
    expect(root.renderer.getAllText().join(" ")).not.toContain("10.00 ms")
    root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
    expect(frames.subscriberCount).toBe(0)
  } finally {
    root.unmount()
    if (release) {
      const cleanup: () => void = release
      cleanup()
    }
    restore()
  }
})

test("stopping keeps the header rate and later telemetry refreshes it without the popup", async () => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  let publish: (() => void) | null = null
  const restore = configureProjectBackend(() => {
    const backend = createMockProjectBackend()
    return {
      ...backend,
      subscribe(listener) {
        // Hold the engine's frames back and deliver them only through `publish`: a real engine
        // publishes its first frame for a new control sequence a moment after accepting it, so a
        // read right after Play/Stop sees no telemetry for that sequence yet.
        let held: BackendTelemetry | null = null
        const unsubscribe = backend.subscribe(frame => {
          held = frame
        })
        publish = () => {
          const latest: BackendTelemetry | null = held
          if (!latest) throw new Error("Mock backend published no frame")
          listener({
            ...latest,
            sequence: latest.sequence + 1,
            clock: {
              kind: "sample",
              bar: latest.clock.bar,
              barsPerSecond: latest.clock.barsPerSecond,
              frame: 0,
              sampleRate: 48000,
            },
            outputLatencyFrames: 240,
          })
        }
        return unsubscribe
      },
    }
  })
  const frames = createTestAnimationFrames()
  const root = createTestRoot({ width: 600, height: 300 })
  let release: (() => void) | null = null
  try {
    root.render(
      <ThemeProvider>
        <AnimationFrameProvider source={frames}>
          <PerformanceStatus labels={englishTransportLabels} />
        </AnimationFrameProvider>
      </ThemeProvider>
    )
    flushSync(() => {
      release = startProjectRuntime()
    })
    const text = () => {
      root.renderer.flush()
      return root.renderer.getPaintedText().join(" ")
    }
    expect(text()).toContain(englishTransportLabels.unavailable)
    const deliver = async () => {
      flushSync(() => {
        if (!publish) throw new Error("Missing producer")
        publish()
      })
      // The readout re-reads in an effect; its state update lands after the current task.
      await Bun.sleep(0)
    }
    await deliver()
    expect(text()).toContain("48 kHz")
    flushSync(projectActions.togglePlay)
    expect(await whenProjectBackendIdle()).toBe(true)
    await deliver()
    flushSync(projectActions.togglePlay)
    expect(await whenProjectBackendIdle()).toBe(true)
    await Bun.sleep(0)
    // Stopped: no animation frames run, and the engine has not published for the Stop yet.
    expect(frames.subscriberCount).toBe(0)
    expect(text()).toContain("48 kHz")
    await deliver()
    expect(text()).toContain("48 kHz")
  } finally {
    root.unmount()
    if (release) {
      const cleanup: () => void = release
      cleanup()
    }
    restore()
  }
})
