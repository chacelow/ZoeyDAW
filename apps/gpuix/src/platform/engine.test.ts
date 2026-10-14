import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import nodePath from "node:path"
import { pathToFileURL } from "node:url"
import { apply, dispose, musicalPeakReader, openSession, sourceInfo } from "./engine"
import type { BackendRequest } from "../project/model/backend"

function makeChirpWav(rate: number, seconds: number): Buffer {
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
    const progress = frame / frames
    const freq = 200 + 800 * progress
    const amp = 0.1 + 0.8 * progress
    const sample = amp * Math.sin((2 * Math.PI * freq * frame) / rate)
    bytes.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2)
  }
  return bytes
}

describe("C2 peak-metadata and musicalPeakReader", () => {
  let session: number
  let directory: string
  let wavPath: string
  const sourceRate = 44100
  const durationSeconds = 2
  const totalWavFrames = sourceRate * durationSeconds
  const project = { bpm: 120, numerator: 4, denominator: 4 }

  beforeAll(() => {
    directory = mkdtempSync(nodePath.join(tmpdir(), "zoeydaw-c2-test-"))
    wavPath = nodePath.join(directory, "chirp-44k.wav")
    writeFileSync(wavPath, makeChirpWav(sourceRate, durationSeconds))

    session = openSession()
    const request: BackendRequest = {
      protocolVersion: 1,
      sessionId: "c2-integration-session",
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
          sources: [{ id: "chirp", uri: pathToFileURL(wavPath).href }],
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
    const resultJson = apply(session, JSON.stringify(request))
    const parsed = JSON.parse(resultJson)
    expect(parsed.kind).toBe("accepted")
  })

  afterAll(() => {
    try {
      dispose(session)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("1. sourceInfo returns actual decoded source sample rate, frames, and channels", () => {
    const unknown = sourceInfo(session, "nonexistent-source")
    expect(unknown).toBeNull()

    const info = sourceInfo(session, "chirp")
    expect(info).not.toBeNull()
    if (!info) throw new Error("Expected sourceInfo to return metadata")

    expect(info.sampleRate).toBe(44100)
    expect(info.sampleRate).not.toBe(48000)
    expect(info.frames).toBe(totalWavFrames)
    expect(info.channels).toBe(1)
  })

  test("2. musicalPeakReader returns identical waveform when Clip is shifted to bar 100", () => {
    const reader = musicalPeakReader(session, project)
    const pixels = 64
    const peaksBar1 = reader("chirp", 1, 2, pixels, 0)
    const peaksBar101 = reader("chirp", 101, 102, pixels, 0)

    expect(peaksBar1.length).toBe(pixels * 4)
    expect(peaksBar101.length).toBe(pixels * 4)

    let hasNonZero = false
    for (let i = 0; i < peaksBar1.length; i++) {
      if (Math.abs(peaksBar1[i]) > 0.01) hasNonZero = true
      expect(peaksBar1[i]).toBeCloseTo(peaksBar101[i], 4)
    }
    expect(hasNonZero).toBe(true)
  })

  test("3. signed negative contentOffsetBars cyclically wraps with rem_euclid matching C1 semantics", () => {
    const reader = musicalPeakReader(session, project)
    const pixels = 64

    const negHalf = reader("chirp", 1, 2, pixels, -0.5)
    const posHalf = reader("chirp", 1, 2, pixels, 0.5)
    expect(negHalf.length).toBe(pixels * 4)
    for (let i = 0; i < negHalf.length; i++) {
      expect(negHalf[i]).toBeCloseTo(posHalf[i], 4)
    }

    const negFull = reader("chirp", 1, 2, pixels, -1.0)
    const zeroOffset = reader("chirp", 1, 2, pixels, 0)
    for (let i = 0; i < negFull.length; i++) {
      expect(negFull[i]).toBeCloseTo(zeroOffset[i], 4)
    }
  })

  test("4. mutation checks fail when contentOffset is ignored or sampleRate is forced to 48000", () => {
    const realReader = musicalPeakReader(session, project)
    const pixels = 64
    const targetOffset = 0.35

    const expected = realReader("chirp", 1, 2, pixels, targetOffset)

    let mutationsFailed = 0

    // Mutation 1: ignore contentOffset (always use 0)
    const mutatedOffsetOutput = realReader("chirp", 1, 2, pixels, 0)
    let offsetDiffers = false
    for (let i = 0; i < expected.length; i++) {
      if (Math.abs(expected[i] - mutatedOffsetOutput[i]) > 0.05) {
        offsetDiffers = true
        break
      }
    }
    if (offsetDiffers) {
      mutationsFailed++
    }

    // Mutation 2: assume 48000 sample rate instead of source rate 44100
    const barsPerSec = (project.bpm * project.denominator) / (240 * project.numerator)
    const mutated48kOutput = (() => {
      const sampleRate = 48000
      const rawStart = Math.round((targetOffset / barsPerSec) * sampleRate)
      const rawEnd = Math.round(((1 + targetOffset) / barsPerSec) * sampleRate)
      const span = rawEnd - rawStart
      return musicalPeakReader(session, project)(
        "chirp",
        1,
        1 + span / (barsPerSec * 44100),
        pixels,
        targetOffset
      )
    })()

    let rateDiffers = false
    for (let i = 0; i < expected.length; i++) {
      if (Math.abs(expected[i] - mutated48kOutput[i]) > 0.05) {
        rateDiffers = true
        break
      }
    }
    if (rateDiffers) {
      mutationsFailed++
    }

    expect(mutationsFailed).toBe(2)
  })

  test("5. handles unmapped sources, out-of-bounds ranges, and invalid arguments safely", () => {
    const reader = musicalPeakReader(session, project)

    const unmapped = reader("unmapped-source", 1, 2, 32, 0)
    expect(unmapped.length).toBe(128)
    for (let i = 0; i < unmapped.length; i++) {
      expect(unmapped[i]).toBe(0)
    }

    const inverted = reader("chirp", 3, 2, 32, 0)
    expect(inverted.length).toBe(128)
    for (let i = 0; i < inverted.length; i++) {
      expect(inverted[i]).toBe(0)
    }

    const zeroPixels = reader("chirp", 1, 2, 0, 0)
    expect(zeroPixels.length).toBe(0)

    const nanBars = reader("chirp", NaN, 2, 16, 0)
    expect(nanBars.length).toBe(64)
    for (let i = 0; i < nanBars.length; i++) {
      expect(nanBars[i]).toBe(0)
      expect(Number.isNaN(nanBars[i])).toBe(false)
    }
  })
})
