import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { flushSync, render, useGpuix } from "@gpuix/react"
import { useEffect, useMemo, useState } from "react"
import { windowDiagnostics } from "@zoeydaw/native"
import {
  AnimationFrameProvider,
  createAnimationFrameSource,
  useAnimationFrame,
  useResumeFrame,
} from "../src/platform/frame"
import {
  projectActions,
  readProjectTelemetry,
  startProjectRuntime,
  useProjectState,
} from "../src/project/adapters"
import { ThemeProvider, useTheme } from "../src/shared/theme/ThemeProvider"
import { enforceDesktopDeadline } from "./desktop-deadline"

const deadlineMs = enforceDesktopDeadline()
const title = "F3 frame probe"
const outputDirectory = mkdtempSync(path.join(tmpdir(), "zoeydaw-f3-"))
const logPath = process.env.F3_LOG ?? path.join(outputDirectory, "frames.jsonl")
const contextPath = process.env.F3_CONTEXT ?? path.join(outputDirectory, "present-context.json")
const sample = { callbacks: 0, displayedSequence: -1, phase: "startup" }
process.stdout.write(`F3_LOG=${logPath}\nF3_CONTEXT=${contextPath}\n`)
function publishContext() {
  if (process.env.F3_PRESENT_LOG)
    writeFileSync(
      contextPath,
      JSON.stringify({
        phase: sample.phase,
        sequence: readProjectTelemetry()?.sequence ?? -1,
        unixMs: Date.now(),
      })
    )
}
const origin = performance.now()
publishContext()

function Counter() {
  const theme = useTheme()
  const playing = useProjectState(s => s.session.playing)
  const [counter, setCounter] = useState(0)
  const advance = () => {
    sample.callbacks++
    sample.displayedSequence = readProjectTelemetry()?.sequence ?? -1
    setCounter(sample.callbacks)
  }
  useAnimationFrame(advance, playing)
  useResumeFrame(() => flushSync(advance), playing)
  return (
    <div style={{ flexGrow: 1, backgroundColor: theme.colors.background }}>
      <text
        style={{ color: theme.colors.foreground, fontSize: theme.control["--text-control-track"] }}
      >
        {title}: callbacks {counter}; telemetry {sample.displayedSequence};{" "}
        {playing ? "playing" : "stopped"}
      </text>
    </div>
  )
}

function Probe() {
  const { renderer } = useGpuix()
  const source = useMemo(() => {
    if (!renderer) throw new Error("Probe requires renderer")
    return createAnimationFrameSource(renderer)
  }, [renderer])
  useEffect(() => {
    if (!renderer) return
    const release = startProjectRuntime()
    projectActions.togglePlay()
    const unsubscribe = useProjectState.subscribe(() => {
      publishContext()
    })
    const input = createInterface({ input: process.stdin })
    const onLine = (command: string) => {
      if (Date.now() >= deadlineMs) process.exit(0)
      sample.phase = command.startsWith("mark:") ? command.slice(5) : command
      publishContext()
      if (command === "minimized") renderer.minimizeWindow?.()
      if (command === "foreground" || command.startsWith("restored")) renderer.activateWindow?.()
      if (command === "stopped") projectActions.togglePlay()
    }
    input.on("line", onLine)
    // Sampling only: never calls setState or asks for a frame.
    const timer = setInterval(() => {
      const record = {
        ms: performance.now() - origin,
        phase: sample.phase,
        window: windowDiagnostics(title),
        stats: renderer.getDebugFrameOverlayStats?.(),
        callbacks: sample.callbacks,
        displayedSequence: sample.displayedSequence,
        sequence: readProjectTelemetry()?.sequence ?? -1,
        cpu: process.cpuUsage(),
      }
      appendFileSync(logPath, JSON.stringify(record) + "\n")
    }, 250)
    appendFileSync(
      logPath,
      JSON.stringify({ pid: process.pid, missingWindow: windowDiagnostics("F3 nonexistent") }) +
        "\n"
    )
    process.stdout.write("F3 ready\n")
    return () => {
      clearInterval(timer)
      input.off("line", onLine)
      input.close()
      unsubscribe()
      release()
    }
  }, [renderer])
  return (
    <AnimationFrameProvider source={source}>
      <ThemeProvider>
        <Counter />
      </ThemeProvider>
    </AnimationFrameProvider>
  )
}
render(<Probe />, { title, width: 600, height: 150, focus: false })
