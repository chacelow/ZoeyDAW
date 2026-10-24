import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
const { resolve } = path

const [inputPath, outputPath, ratioText, resultPath] = process.argv.slice(2)
if (!inputPath || !outputPath || !ratioText || !resultPath) {
  throw new Error("Usage: node measure-stretch.mjs input.wav output.wav durationRatio result.json")
}
async function pcm(path) {
  const bytes = await readFile(path)
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("Only RIFF WAVE measurement inputs are supported")
  let format
  let data
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4)
    const tag = bytes.toString("ascii", offset, offset + 4)
    if (offset + 8 + size > bytes.length) throw new Error("Truncated WAV chunk")
    if (tag === "fmt ") {
      if (size < 16) throw new Error("Truncated WAV format")
      let code = bytes.readUInt16LE(offset + 8)
      if (code === 0xfffe) {
        if (
          size < 40 ||
          bytes.readUInt16LE(offset + 24) < 22 ||
          bytes.subarray(offset + 36, offset + 48).toString("hex") !== "00001000800000aa00389b71"
        ) {
          throw new Error("Unsupported WAV extensible subformat")
        }
        code = bytes.readUInt32LE(offset + 32)
      }
      format = {
        code,
        channels: bytes.readUInt16LE(offset + 10),
        rate: bytes.readUInt32LE(offset + 12),
        align: bytes.readUInt16LE(offset + 20),
        bits: bytes.readUInt16LE(offset + 22),
      }
    }
    if (tag === "data") data = bytes.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + (size % 2)
  }
  if (!format || !data || ![1, 3].includes(format.code))
    throw new Error("Unsupported or missing PCM format")
  if (
    (format.code === 1 && ![16, 24, 32].includes(format.bits)) ||
    (format.code === 3 && ![32, 64].includes(format.bits))
  )
    throw new Error("Unsupported PCM bit depth")
  if (
    format.channels < 1 ||
    format.align !== (format.channels * format.bits) / 8 ||
    data.length % format.align !== 0
  )
    throw new Error("Invalid WAV frame layout")
  const frames = Math.floor(data.length / format.align)
  const channels = Array.from({ length: format.channels }, () => new Float64Array(frames))
  let nonFinite = 0
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < format.channels; channel++) {
      const offset = frame * format.align + (channel * format.bits) / 8
      const value =
        format.code === 3
          ? format.bits === 32
            ? data.readFloatLE(offset)
            : data.readDoubleLE(offset)
          : data.readIntLE(offset, format.bits / 8) / 2 ** (format.bits - 1)
      if (!Number.isFinite(value)) nonFinite++
      channels[channel][frame] = value
    }
  }
  return { ...format, frames, samples: channels, nonFinite }
}
function signal(audio) {
  const samples = audio.samples[0]
  const start = Math.floor(audio.rate)
  const end = Math.min(samples.length - audio.rate, start + audio.rate * 4)
  let energy = 0
  const crossings = []
  for (let index = start; index < end; index++) {
    energy += samples[index] ** 2
    if (samples[index] <= 0 && samples[index + 1] > 0)
      crossings.push(index - samples[index] / (samples[index + 1] - samples[index]))
  }
  const frequencyHz =
    crossings.length > 2
      ? ((crossings.length - 1) * audio.rate) / (crossings.at(-1) - crossings[0])
      : null
  return { rms: Math.sqrt(energy / Math.max(1, end - start)), frequencyHz }
}
const input = await pcm(resolve(inputPath))
const output = await pcm(resolve(outputPath))
const inputSignal = signal(input)
const outputSignal = signal(output)
const contract = JSON.parse(
  await readFile(
    new URL("../../docs/research/audio-acceptance-contract.json", import.meta.url),
    "utf8"
  )
)
const durationRatio = Number(ratioText)
if (!Number.isFinite(durationRatio) || durationRatio <= 0) throw new Error("Invalid duration ratio")
const durationErrorFrames = Math.abs(
  output.frames - Math.round((input.frames * durationRatio * output.rate) / input.rate)
)
const pitchErrorCents =
  inputSignal.frequencyHz && outputSignal.frequencyHz
    ? Math.abs(1200 * Math.log2(outputSignal.frequencyHz / inputSignal.frequencyHz))
    : null
const rmsDifferenceDb = Math.abs(20 * Math.log10(outputSignal.rms / inputSignal.rms))
let channelDifferencePeak = null
let channelSumPeak = null
if (output.channels === 2) {
  channelDifferencePeak = 0
  channelSumPeak = 0
  for (let index = 0; index < output.frames; index++) {
    channelDifferencePeak = Math.max(
      channelDifferencePeak,
      Math.abs(output.samples[0][index] - output.samples[1][index])
    )
    channelSumPeak = Math.max(
      channelSumPeak,
      Math.abs(output.samples[0][index] + output.samples[1][index])
    )
  }
}
const thresholds = contract.thresholds
const checks = {
  duration: durationErrorFrames <= thresholds.outputDurationErrorFramesMax,
  pitch: pitchErrorCents !== null && pitchErrorCents <= thresholds.pitchAbsCentsMax,
  rms:
    Number.isFinite(rmsDifferenceDb) && rmsDifferenceDb <= thresholds.steadyToneRmsDifferenceDbMax,
  finite: output.nonFinite === 0,
  sampleRate: output.rate === input.rate,
  channels: output.channels === input.channels,
}
if (inputPath.includes("stereo-identical"))
  checks.identicalChannels =
    channelDifferencePeak !== null &&
    channelDifferencePeak <= thresholds.identicalChannelDifferencePeakMax
if (inputPath.includes("stereo-antiphase"))
  checks.antiPhaseChannels =
    channelSumPeak !== null && channelSumPeak <= thresholds.antiPhaseChannelSumPeakMax
const result = {
  input: inputPath,
  output: outputPath,
  durationRatio,
  durationErrorFrames,
  pitchErrorCents,
  rmsDifferenceDb,
  channelDifferencePeak,
  channelSumPeak,
  nonFinite: output.nonFinite,
  checks,
  verdict: Object.values(checks).every(Boolean) ? "VERIFIED_SYNTHETIC_ONLY" : "NOT_VERIFIED",
  excludes: [
    "musical quality",
    "engine callback performance",
    "device latency",
    "Live comparison",
    "platform compatibility",
  ],
}
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
if (Object.values(checks).some(value => !value)) process.exitCode = 1
