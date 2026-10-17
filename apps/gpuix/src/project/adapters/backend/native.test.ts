import { testWithAudioOutput } from "@/platform/verification/audio-test"
import { expect, jest, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import nodePath from "node:path"
import { pathToFileURL } from "node:url"
import { createNativeBackend } from "./native"
import type {
  BackendRequest,
  BackendTelemetry,
  BackendTrack,
  ProjectBackend,
} from "../../model/backend"
import * as engine from "../../../platform/engine"

test("importing the default project context never opens a native session", async () => {
  const open = jest.spyOn(engine, "openSession").mockImplementation(() => {
    throw new Error("Module import attempted to open the device")
  })
  try {
    await import(new URL("../context.ts?native-import-only", import.meta.url).href)
    expect(open).not.toHaveBeenCalled()
  } finally {
    open.mockRestore()
  }
})

test.each([false, true])(
  "releases the opened native session when telemetry registration fails (cleanup throws: %s)",
  cleanupThrows => {
    const failure = new Error("Telemetry registration failed")
    let handle: number | undefined
    const dispose = engine.dispose
    const cleanup = jest.spyOn(engine, "dispose").mockImplementation(opened => {
      dispose(opened)
      if (cleanupThrows) throw new Error("Native cleanup failed")
    })
    const subscribe = jest.spyOn(engine, "subscribeTelemetry").mockImplementation(opened => {
      handle = opened
      throw failure
    })
    try {
      let caught: unknown
      try {
        createNativeBackend()
      } catch (error) {
        caught = error
      }
      expect(caught).toBe(failure)
      if (handle === undefined) {
        throw new Error("Expected an opened native session")
      }
      const openedHandle = handle
      expect(() => engine.sourceInfo(openedHandle, "missing-source")).toThrow()
    } finally {
      subscribe.mockRestore()
      cleanup.mockRestore()
      if (handle !== undefined) {
        dispose(handle)
      }
    }
  }
)

function wav(rate: number, seconds: number): Buffer {
  const frames = rate * seconds
  const bytes = Buffer.alloc(44 + frames * 2)
  bytes.write("RIFF", 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write("WAVEfmt ", 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24)
  bytes.writeUInt32LE(rate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write("data", 36)
  bytes.writeUInt32LE(frames * 2, 40)
  for (let frame = 0; frame < frames; frame++) {
    bytes.writeInt16LE(
      Math.round(0.2 * 32767 * Math.sin((2 * Math.PI * 1000 * frame) / rate)),
      44 + frame * 2
    )
  }
  return bytes
}

function receive(
  backend: ProjectBackend,
  frames: BackendTelemetry[],
  predicate: (frame: BackendTelemetry) => boolean
): Promise<BackendTelemetry> {
  const current = [...frames].reverse().find(predicate)
  if (current) {
    return Promise.resolve(current)
  }
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error(`Native telemetry timed out: ${JSON.stringify(frames.at(-1))}`))
    }, 20_000)
    unsubscribe = backend.subscribe(frame => {
      if (predicate(frame)) {
        clearTimeout(timeout)
        unsubscribe()
        resolve(frame)
      }
    })
  })
}

testWithAudioOutput(
  "real decoder, device clock, seeks, finite meters and visible peaks",
  async () => {
    const directory = mkdtempSync(nodePath.join(tmpdir(), "zoeydaw-engine-"))
    const path = nodePath.join(directory, "sine test.wav")
    writeFileSync(path, wav(44100, 3))
    const backend = createNativeBackend()
    const frames: BackendTelemetry[] = []
    const unsubscribe = backend.subscribe(frame => {
      frames.push(frame)
    })
    const main: BackendTrack = {
      id: "main",
      kind: "main",
      output: "external",
      input: "none",
      inputChannel: null,
      outputChannel: null,
      monitor: "off",
      volumeDb: -30,
      pan: 0,
      mute: false,
      solo: false,
      armed: false,
      sends: {},
      returnPost: true,
      cueOutput: null,
      cueVolumeDb: 0,
      clips: [],
      automation: [],
    }
    let request: BackendRequest = {
      protocolVersion: 1,
      sessionId: "native-integration",
      sequence: 0,
      baseRevision: 0,
      revision: 0,
      stage: "open",
      editId: null,
      state: {
        project: {
          bpm: 120,
          numerator: 4,
          denominator: 4,
          loop: { enabled: false, startBar: 1, endBar: 3 },
          sources: [{ id: "sine", uri: pathToFileURL(path).href }],
          tracks: [
            {
              ...main,
              id: "audio",
              kind: "audio",
              output: "main",
              volumeDb: 0,
              clips: [
                {
                  id: "clip",
                  kind: "audio",
                  startBar: 1,
                  lengthBars: 2,
                  sourceOffsetBars: 0,
                  sourceId: "sine",
                  gainDb: 0,
                  fadeInBars: 0,
                  fadeOutBars: 0,
                  fadeInOffsetBars: 0,
                  fadeOutOffsetBars: 0,
                  fadeInCurve: 0,
                  fadeOutCurve: 0,
                  fadeInCurvePosition: 0.5,
                  fadeOutCurvePosition: 0.5,
                },
              ],
            },
            main,
          ],
        },
        control: {
          playing: false,
          recording: false,
          seekBar: 1,
          seekGeneration: 0,
          heldNotes: [],
          midiVelocity: 0.8,
        },
      },
    }
    try {
      expect(backend.apply(request)).toEqual({
        kind: "accepted",
        sessionId: request.sessionId,
        sequence: 0,
        revision: 0,
      })
      const stopped = await receive(backend, frames, frame => frame.appliedSequence === 0)
      expect(stopped.clock.kind).toBe("sample")
      expect(stopped.levels.main).toEqual({ peak: [-120, -120], rms: [-120, -120] })
      const peaks = backend.readPeaks("sine", 1, 1.05, 64, 0)
      expect(peaks).toBeInstanceOf(Float32Array)
      expect(peaks.length).toBe(256)
      for (let index = 0; index < peaks.length; index += 2) {
        expect(peaks[index]).toBeCloseTo(-0.2, 2)
        expect(peaks[index + 1]).toBeCloseTo(0.2, 2)
      }
      request = {
        ...request,
        sequence: 1,
        stage: "transport",
        state: { ...request.state, control: { ...request.state.control, playing: true } },
      }
      expect((await backend.apply(request)).kind).toBe("accepted")
      const playing = await receive(
        backend,
        frames,
        frame => frame.appliedSequence === 1 && frame.clock.bar >= 2 && frame.levels.main.peak[0] > -90
      )
      expect(playing.playing).toBe(true)
      expect(playing.clock.bar).toBeGreaterThan(1.7)
      expect(playing.levels.main.peak[0]).toBeLessThan(-30)
      expect(playing.levels.main.rms[0]).toBeGreaterThan(-90)
      expect(playing.levels.main.rms[0]).toBeLessThanOrEqual(playing.levels.main.peak[0])
      if (playing.clock.kind !== "sample") {
        throw new Error("Expected actual device sample clock")
      }
      expect(playing.clock.frame).toBeGreaterThan(playing.clock.sampleRate * 1.5)
      expect(playing.outputLatencyFrames === null || playing.outputLatencyFrames >= 0).toBe(true)
      request = {
        ...request,
        sequence: 2,
        state: {
          ...request.state,
          control: { ...request.state.control, playing: false, seekBar: 1.25, seekGeneration: 2 },
        },
      }
      expect((await backend.apply(request)).kind).toBe("accepted")
      const seek = await receive(backend, frames, frame => frame.appliedSequence === 2)
      expect(seek.clock.kind).toBe("sample")
      if (seek.clock.kind === "sample") {
        expect(seek.clock.frame).toBe(Math.round(seek.clock.sampleRate * 0.5))
      }
      expect(seek.levels.main).toEqual({ peak: [-120, -120], rms: [-120, -120] })
      expect(
        backend.apply({
          ...request,
          sequence: 3,
          state: {
            ...request.state,
            control: { ...request.state.control, seekBar: 2, seekGeneration: 1 },
          },
        })
      ).toMatchObject({ kind: "rejected", code: "protocol" })
      expect(
        backend.apply({
          ...request,
          sequence: 4,
          state: {
            ...request.state,
            project: {
              ...request.state.project,
              sources: [{ id: "sine", uri: nodePath.join(directory, "missing.wav") }],
            },
          },
        })
      ).toMatchObject({ kind: "rejected", code: "rejected" })
      const afterRejection = await receive(
        backend,
        frames,
        frame => frame.sequence > seek.sequence + 2
      )
      expect(afterRejection.appliedSequence).toBe(2)
      console.info(
        `native device ${JSON.stringify({ sampleRate: playing.clock.sampleRate, outputLatencyFrames: playing.outputLatencyFrames, playingFrames: playing.clock.frame, mainDbFS: playing.levels.main, stoppedDbFS: seek.levels.main, telemetryCount: frames.length })}`
      )
      unsubscribe()
      backend.dispose()
      backend.dispose()
      expect(backend.apply({ ...request, sequence: 5 })).toMatchObject({
        kind: "rejected",
        code: "disposed",
      })
      expect(backend.readPeaks("sine", 1, 1.05, 64, 0)).toHaveLength(0)
    } finally {
      unsubscribe()
      backend.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  },
  60_000
)
