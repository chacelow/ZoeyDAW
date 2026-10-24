import { createHash } from "node:crypto"
import { mkdir, open, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
const { resolve } = path

const destination = resolve(process.argv[2] ?? ".audio-validation/corpus")
const sampleRate = 48_000
await mkdir(destination, { recursive: true })
function seededRandom(initialSeed) {
  let seed = initialSeed
  return () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 4_294_967_296
  }
}
const random = seededRandom(1_073_741_823)
const header = (frames, channels) => {
  const result = Buffer.alloc(44)
  result.write("RIFF", 0)
  result.writeUInt32LE(36 + frames * channels * 2, 4)
  result.write("WAVEfmt ", 8)
  result.writeUInt32LE(16, 16)
  result.writeUInt16LE(1, 20)
  result.writeUInt16LE(channels, 22)
  result.writeUInt32LE(sampleRate, 24)
  result.writeUInt32LE(sampleRate * channels * 2, 28)
  result.writeUInt16LE(channels * 2, 32)
  result.writeUInt16LE(16, 34)
  result.write("data", 36)
  result.writeUInt32LE(frames * channels * 2, 40)
  return result
}
const entries = []
async function audio(name, seconds, channels, sample, metadata = {}) {
  const frames = Math.round(seconds * sampleRate)
  const bytes = Buffer.alloc(frames * channels * 2)
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const value = Math.max(-1, Math.min(1, sample(frame / sampleRate, channel, frame)))
      bytes.writeInt16LE(Math.round(value * 32767), (frame * channels + channel) * 2)
    }
  }
  const data = Buffer.concat([header(frames, channels), bytes])
  await writeFile(resolve(destination, `${name}.wav`), data)
  entries.push({
    name,
    file: `${name}.wav`,
    sampleRate,
    channels,
    frames,
    sha256: createHash("sha256").update(data).digest("hex"),
    ...metadata,
  })
}
const tone = t => 0.25 * Math.sin(2 * Math.PI * 440 * t)
await audio("tone-440-mono", 8, 1, tone, { frequencyHz: 440 })
await audio("stereo-identical", 8, 2, tone, { relation: "left-equals-right" })
await audio("stereo-antiphase", 8, 2, (t, channel) => tone(t) * (channel ? -1 : 1), {
  relation: "left-equals-negative-right",
})
const click = t => {
  const offset = t % 0.5
  return offset < 0.012 ? 0.6 * Math.exp(-offset * 600) * Math.cos(2 * Math.PI * 1800 * offset) : 0
}
await audio("click-120bpm", 8, 2, click, {
  bpm: 120,
  beatsSeconds: Array.from({ length: 16 }, (_, index) => index * 0.5),
})
await audio("one-shot", 1, 1, t => (t < 0.3 ? (random() * 2 - 1) * Math.exp(-t * 25) * 0.6 : 0), {
  kind: "one-shot",
})
await audio("odd-seven-beat-loop", 3.5, 1, click, { bpm: 120, beatCount: 7 })
await audio("leading-silence", 4, 1, t => (t < 1 ? 0 : click(t - 1)), {
  firstDownbeatSeconds: 1,
  bpm: 120,
})
const valid = await readFile(resolve(destination, "tone-440-mono.wav"))
await writeFile(resolve(destination, "truncated-wav.wav"), valid.subarray(0, 60))
entries.push({
  name: "truncated-wav",
  file: "truncated-wav.wav",
  expected: "reject-or-explicit-truncation",
  sha256: createHash("sha256").update(valid.subarray(0, 60)).digest("hex"),
})
const longFrames = sampleRate * 3600
const longPath = resolve(destination, "long-file.wav")
const longHandle = await open(longPath, "w")
await longHandle.write(header(longFrames, 2), 0, 44, 0)
await longHandle.truncate(44 + longFrames * 4)
await longHandle.close()
entries.push({
  name: "long-file",
  file: "long-file.wav",
  frames: longFrames,
  channels: 2,
  sampleRate,
  construction: "canonical-PCM16-header-followed-by-zero-samples",
  logicalBytes: 44 + longFrames * 4,
  purpose: "one-hour-sparse-file-memory-and-seek-not-musical-quality",
})
await writeFile(
  resolve(destination, "manifest.json"),
  `${JSON.stringify({ version: 1, generator: "scripts/audio/generate-corpus.mjs", license: "CC0-1.0", seed: 1073741823, entries }, null, 2)}\n`
)
console.log(JSON.stringify({ destination, cases: entries.length, musicalQualityVerified: false }))
