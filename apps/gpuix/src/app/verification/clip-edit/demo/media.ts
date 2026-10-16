import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

export interface VerificationMedia {
  uri: string
  dispose(): void
}

export function createVerificationMedia(): VerificationMedia {
  const directory = mkdtempSync(path.join(os.tmpdir(), "zoeydaw-clip-edit-"))
  const sampleRate = 44_100
  const frames = sampleRate * 2
  const channels = 2
  const bytesPerSample = 2
  const bytes = Buffer.alloc(44 + frames * channels * bytesPerSample)
  bytes.write("RIFF", 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write("WAVEfmt ", 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(channels, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  bytes.writeUInt16LE(channels * bytesPerSample, 32)
  bytes.writeUInt16LE(bytesPerSample * 8, 34)
  bytes.write("data", 36)
  bytes.writeUInt32LE(frames * channels * bytesPerSample, 40)
  for (let frame = 0; frame < frames; frame++) {
    const envelope = Math.sin((Math.PI * frame) / (frames - 1))
    const left = Math.sin((2 * Math.PI * 220 * frame) / sampleRate) * envelope * 0.65
    const right = Math.sin((2 * Math.PI * 330 * frame) / sampleRate) * envelope * 0.4
    bytes.writeInt16LE(Math.round(left * 32_767), 44 + frame * channels * bytesPerSample)
    bytes.writeInt16LE(Math.round(right * 32_767), 44 + (frame * channels + 1) * bytesPerSample)
  }
  const filename = path.join(directory, "stereo.wav")
  writeFileSync(filename, bytes)
  return {
    uri: pathToFileURL(filename).href,
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  }
}
