import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import path from "node:path"
const { resolve } = path
const ffmpegBinary = process.argv[3]
if (!ffmpegBinary || !path.isAbsolute(ffmpegBinary))
  throw new Error("Pass the absolute ffmpeg executable path as the second argument")

const directory = resolve(process.argv[2] ?? ".audio-validation/corpus")
const input = resolve(directory, "tone-440-mono.wav")
const derivatives = [
  ["tone-pcm24.wav", ["-c:a", "pcm_s24le"]],
  ["tone-float32.wav", ["-c:a", "pcm_f32le"]],
  ["tone-pcm24.aiff", ["-c:a", "pcm_s24be"]],
  ["tone.flac", ["-c:a", "flac"]],
  ["tone-cbr.mp3", ["-c:a", "libmp3lame", "-b:a", "192k"]],
  ["tone-vbr.mp3", ["-c:a", "libmp3lame", "-q:a", "2"]],
]
const entries = []
for (const [file, options] of derivatives) {
  const result = spawnSync(
    ffmpegBinary,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-n",
      "-i",
      input,
      "-map_metadata",
      "-1",
      ...options,
      resolve(directory, file),
    ],
    { encoding: "utf8" }
  )
  if (result.status !== 0) throw new Error(`ffmpeg ${file}: ${result.stderr}`)
  const bytes = readFileSync(resolve(directory, file))
  entries.push({
    file,
    command: ["ffmpeg", "-i", "tone-440-mono.wav", ...options, file],
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  })
}
const version = spawnSync(ffmpegBinary, ["-version"], { encoding: "utf8" }).stdout.split("\n")[0]
await writeFile(
  resolve(directory, "derivatives.json"),
  `${JSON.stringify({ version: 1, encoder: version, entries }, null, 2)}\n`
)
console.log(JSON.stringify({ directory, formats: entries.length, encoder: version }))
