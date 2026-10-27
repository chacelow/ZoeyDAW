import { describe, expect, it } from "vitest"
import { signedWaveformPaths } from "./signed-waveform"
import { interpolateWaveform } from "./waveform-interpolation"
import { waveformPeakValue } from "./waveform-half"
import { waveformRangePlan } from "./waveform-range"
import type { WaveformRange } from "./waveform-range"
import { sourceWaveformIntervals, sourceWaveformPosition } from "./waveform-source"

const source = { peaks: [], start: 0, span: 1 }
function samples(values: number[][]): WaveformRange {
  return {
    kind: "samples",
    sampleRate: 48000,
    totalFrames: values[0].length,
    startFrame: 0,
    frameCount: values[0].length,
    channels: values,
  }
}
const points = (path: string) =>
  Array.from(path.matchAll(/[ML](-?[\d.e+-]+),(-?[\d.e+-]+)/g), value => [
    Number(value[1]),
    Number(value[2]),
  ])

describe("actual waveform detail", () => {
  it("reconstructs the native Lanczos32 half-sample impulse coefficient", () => {
    const data = interpolateWaveform(40, 41, 0.5, frame => (frame === 40 ? 1 : 0))
    expect(data?.frames[1]).toBe(40.5)
    expect(data?.values[1]).toBe(0.6363610029220581)
    expect(data?.values[0]).toBe(1)
  })
  it("morphs newest interpolation phases toward the coarser line between zoom levels", () => {
    const exact = interpolateWaveform(40, 41, 0.5, frame => (frame === 40 ? 1 : 0))!
    const middle = interpolateWaveform(40, 41, 1 / Math.sqrt(2), frame => (frame === 40 ? 1 : 0))!
    expect(middle.values[1]).toBeCloseTo((exact.values[1] + 0.5) / 2, 6)
  })
  it("draws filled detail contours and original sample markers only at eight pixels per sample", () => {
    const range = samples([[0, 0.5, -0.5, 0]])
    const [ordinary] = signedWaveformPaths(source, [range], 4, 0, 1, 16, 100)
    const [close] = signedWaveformPaths(source, [range], 4, 0, 1, 32, 100)
    expect(ordinary.path.endsWith("Z")).toBe(true)
    expect(ordinary.markers).toBe("")
    expect(close.markers.match(/h2v2h-2Z/g)).toHaveLength(4)
  })
  it("keeps stereo DC signals on their own signed side and does not clip over-unity audio before channel bounds", () => {
    const range = samples([Array(64).fill(0.5), Array(64).fill(-0.5)])
    const paths = signedWaveformPaths(source, [range], 64, 0.25, 0.75, 32, 101)
    const top = points(paths[0].path).map(point => point[1])
    const bottom = points(paths[1].path).map(point => point[1])
    expect(Math.max(...top)).toBeLessThan(25.5)
    expect(Math.min(...bottom)).toBeGreaterThan(75.5)
  })
})

describe("actual binary waveform envelope", () => {
  it("emits upper-forward lower-reverse contours instead of alternating min/max zigzags", () => {
    const range: WaveformRange = {
      kind: "envelope",
      sampleRate: 48000,
      totalFrames: 16,
      startFrame: 0,
      frameCount: 16,
      framesPerBin: 4,
      channels: [{ min: [-0.2, -0.8, -0.4, -0.1], max: [0.4, 0.9, 0.2, 0.3] }],
    }
    const [shape] = signedWaveformPaths(source, [range], 16, 0, 1, 4, 100)
    const vertices = points(shape.path)
    expect(shape.kind).toBe("envelope")
    expect(shape.path.endsWith("Z")).toBe(true)
    expect(Math.min(...vertices.map(point => point[1]))).toBeLessThan(10)
    expect(Math.max(...vertices.map(point => point[1]))).toBeGreaterThan(85)
  })
  it("does not erase other source regions when a finer cached window arrives", () => {
    const coarse: WaveformRange = {
      kind: "envelope",
      sampleRate: 48000,
      totalFrames: 64,
      startFrame: 0,
      frameCount: 64,
      framesPerBin: 8,
      channels: [{ min: Array(8).fill(-0.5), max: Array(8).fill(0.5) }],
    }
    const fine: WaveformRange = {
      kind: "samples",
      sampleRate: 48000,
      totalFrames: 64,
      startFrame: 0,
      frameCount: 8,
      channels: [Array(8).fill(0.25)],
    }
    const [path] = signedWaveformPaths(source, [fine, coarse], 64, 0, 1, 4, 100)
    expect(Math.max(...points(path.path).map(point => point[0]))).toBeGreaterThan(3)
  })
  it("does not invent fine detail from a coarse range when the requested binary layer is missing", () => {
    const coarse: WaveformRange = {
      kind: "envelope",
      sampleRate: 48000,
      totalFrames: 64,
      startFrame: 0,
      frameCount: 64,
      framesPerBin: 8,
      channels: [{ min: Array(8).fill(-0.5), max: Array(8).fill(0.5) }],
    }
    expect(signedWaveformPaths(source, [coarse], 64, 0, 1, 128, 100)).toEqual([])
  })
  it("truncates stored peak mantissas like the native binary16 cache", () => {
    expect(waveformPeakValue(0.123456)).toBe(0.1234130859375)
    expect(waveformPeakValue(-0.123456)).toBe(-0.1234130859375)
    expect(waveformPeakValue(2 ** -24)).toBe(2 ** -24)
  })
  it("requests source-aligned pair padding and the full reconstruction support", () => {
    const [far] = waveformRangePlan(48000, 1000.25, 1200, 8.5)
    expect(far.framesPerBin).toBe(8)
    expect(far.startFrame % 16).toBe(0)
    const [near] = waveformRangePlan(48000, 1000.25, 1002.5, 0.125)
    expect(near.startFrame).toBe(968)
    expect(near.frameCount).toBe(68)
    expect(near.framesPerBin).toBe(1)
  })
})

it("projects stretched source windows and loops through marker segments", () => {
  const envelope = {
    ...source,
    span: 2,
    warpMarkers: [
      { id: "a", sourceBar: 1, targetBar: 0.5 },
      { id: "b", sourceBar: 2, targetBar: 2 },
    ],
  }
  expect(sourceWaveformIntervals(envelope, 0.25, 0.5)).toEqual([[0.25, 0.5]])
  expect(sourceWaveformPosition(envelope, 0.25)).toBe(0.25)
  expect(
    sourceWaveformIntervals({ ...envelope, loop: { start: 0, end: 0.5 } }, 0.375, 0.625)
  ).toEqual([
    [0.375, 0.5],
    [0, 0.125],
  ])
  const data = samples([Array(128).fill(0.5)])
  const paths = signedWaveformPaths(envelope, [data], 128, 0, 2, 256, 100)
  const vertices = points(paths[0].path)
  expect(Math.min(...vertices.map(point => point[0]))).toBeLessThanOrEqual(0)
  expect(Math.max(...vertices.map(point => point[0]))).toBeGreaterThanOrEqual(255)
  expect(Math.min(...vertices.map(point => point[1]))).toBeLessThan(30)
})
