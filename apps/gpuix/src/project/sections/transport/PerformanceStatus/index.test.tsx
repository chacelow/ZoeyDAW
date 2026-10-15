import { expect, test } from "bun:test"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { AnimationFrameProvider } from "@/platform/frame"
import {
  configureProjectBackend,
  hydrateProject,
  startProjectRuntime,
  useProjectState,
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
  let publishLatency: ((frames: number) => void) | null = null
  const restore = configureProjectBackend(() => {
    const backend = createMockProjectBackend()
    return {
      ...backend,
      subscribe(listener) {
        let last: BackendTelemetry | null = null
        publishLatency = frames => {
          if (!last) throw new Error("No accepted telemetry fixture")
          last = { ...last, sequence: last.sequence + 1, outputLatencyFrames: frames }
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
  function changeLatency(value: number) {
    if (!publishLatency) throw new Error("Missing producer")
    publishLatency(value)
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
    flushSync(() => changeLatency(480))
    flushSync(() => frames.emit(32))
    root.renderer.flush()
    expect(root.renderer.getPaintedText().join(" ")).toContain("10.00 ms")
    expect(root.renderer.getPaintedText().join(" ")).not.toContain("5.00 ms")
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
