import { describeWithAudioOutput } from "./verification/audio-test"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import nodePath from "node:path"
import { pathToFileURL } from "node:url"
import { apply, dispose, openSession, readPeaksAtBars, sourceInfo } from "./engine"
import type { BackendRequest, PeakReader } from "@/project/model/backend"

const SOURCE_RATE = 44_100
const SOURCE_FRAMES = SOURCE_RATE * 2
const QUARTER = SOURCE_FRAMES / 4
const PIXELS = 4

const samples = Array.from({ length: SOURCE_FRAMES }, (_, frame) => {
  const x = frame / SOURCE_FRAMES
  return Math.round(0.9 * 6.75 * x * x * (1 - x) * 32_767)
})

function wav(): Buffer {
  const bytes = Buffer.alloc(44 + SOURCE_FRAMES * 2)
  bytes.write("RIFF", 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write("WAVEfmt ", 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(SOURCE_RATE, 24)
  bytes.writeUInt32LE(SOURCE_RATE * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write("data", 36)
  bytes.writeUInt32LE(SOURCE_FRAMES * 2, 40)
  samples.forEach((sample, frame) => bytes.writeInt16LE(sample, 44 + frame * 2))
  return bytes
}

function quarter(q: number): [number, number] {
  const slice = samples.slice(q * QUARTER, (q + 1) * QUARTER).map(sample => sample / 32_768)
  return [Math.min(...slice), Math.max(...slice)]
}

function expected(quarters: number[]): number[] {
  const channel = quarters.flatMap(quarter)
  return [...channel, ...channel]
}

function expectEnvelopes(actual: Float32Array, quarters: number[]) {
  const want = expected(quarters)
  expect(actual.length).toBe(want.length)
  actual.forEach((value, index) => {
    expect(Math.abs(value - want[index])).toBeLessThan(0.01)
  })
}

function request(sourceUri: string): BackendRequest {
  return {
    protocolVersion: 1,
    sessionId: "c2-peaks-at-bars",
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
        sources: [{ id: "hump", uri: sourceUri }],
        tracks: [
          {
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
          },
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
}

describeWithAudioOutput("native readPeaksAtBars", () => {
  let session: number
  let directory: string
  let read: PeakReader

  beforeAll(() => {
    directory = mkdtempSync(nodePath.join(tmpdir(), "zoeydaw-c2-"))
    const path = nodePath.join(directory, "hump-44k.wav")
    writeFileSync(path, wav())
    session = openSession()
    read = (sourceId, startBar, endBar, pixels, contentOffsetBars) =>
      readPeaksAtBars(session, sourceId, startBar, endBar, pixels, contentOffsetBars)
    expect(read("hump", 1, 2, PIXELS, 0)).toEqual(new Float32Array(PIXELS * 4))
    const result = JSON.parse(apply(session, JSON.stringify(request(pathToFileURL(path).href))))
    expect(result.kind).toBe("accepted")
  })

  afterAll(() => {
    dispose(session)
    rmSync(directory, { recursive: true, force: true })
  })

  test("sourceInfo reports the decoded 44.1 kHz source, not the 48 kHz device", () => {
    expect(sourceInfo(session, "missing")).toBeNull()
    expect(sourceInfo(session, "hump")).toEqual({
      sampleRate: SOURCE_RATE,
      frames: SOURCE_FRAMES,
      channels: 1,
    })
  })

  test("one bar spans exactly the source frames at the source sample rate", () => {
    expectEnvelopes(read("hump", 1, 2, PIXELS, 0), [0, 1, 2, 3])
  })

  test("shifting the visible range equals shifting the content offset", () => {
    expect(read("hump", 1.25, 1.75, 2, 0)).toEqual(read("hump", 1, 1.5, 2, 0.25))
    expect(read("hump", 1.75, 2.25, 2, 0.5)).toEqual(read("hump", 1, 1.5, 2, 1.25))
    expectEnvelopes(read("hump", 1, 2, PIXELS, 0.25), [1, 2, 3, 0])
  })

  test("ranges past the source end wrap like looped playback", () => {
    expectEnvelopes(read("hump", 1.5, 2.5, PIXELS, 0), [2, 3, 0, 1])
  })

  test("signed negative content offsets wrap modulo the source length", () => {
    expectEnvelopes(read("hump", 1, 2, PIXELS, -0.25), [3, 0, 1, 2])
    expect(read("hump", 1, 2, PIXELS, -0.25)).toEqual(read("hump", 1, 2, PIXELS, 0.75))
    expect(read("hump", 1, 2, PIXELS, -3)).toEqual(read("hump", 1, 2, PIXELS, 0))
  })

  test("unknown sources and empty or non-finite ranges read as silence", () => {
    const silence = new Float32Array(PIXELS * 4)
    expect(read("missing", 1, 2, PIXELS, 0)).toEqual(silence)
    expect(read("hump", 2, 1, PIXELS, 0)).toEqual(silence)
    expect(read("hump", 1, 1, PIXELS, 0)).toEqual(silence)
    expect(read("hump", Number.NaN, 2, PIXELS, 0)).toEqual(silence)
    expect(read("hump", 1, Number.POSITIVE_INFINITY, PIXELS, 0)).toEqual(silence)
    expect(read("hump", 1, 2, PIXELS, Number.NaN)).toEqual(silence)
    expect(read("hump", 1, 2, 0, 0)).toHaveLength(0)
  })
})
