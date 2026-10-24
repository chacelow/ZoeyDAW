import type { RulerFormat } from "@zoeydaw/project-core/types"

/**
Real frame rates. 29.97 is the NTSC rational 30000/1001; the exact ratio keeps
minute boundaries from drifting by a frame.
*/
const RATE: Record<Exclude<RulerFormat, "time">, number> = {
  "24": 24,
  "25": 25,
  "30": 30,
  "29.97-drop": 30_000 / 1001,
  "29.97-non-drop": 30_000 / 1001,
}

function pad(value: number, width: number): string {
  return String(Math.max(0, value)).padStart(width, "0")
}

/**
Converts elapsed seconds to an hh:mm:ss:ff label.
`time` keeps the m:ss shape (plus millis when the step is sub-second).
NTSC formats label 30 frame numbers per second even though they count 29.97
real frames. Drop-frame skips labels 0 and 1 each minute except every tenth
minute, so its labels track wall clock; non-drop keeps every label and drifts.
*/
export function formatRulerTime(seconds: number, format: RulerFormat, withMillis: boolean): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  if (format === "time") {
    const millis = Math.round(safe * 1000)
    const minutes = Math.floor(millis / 60_000)
    const rest = Math.floor((millis % 60_000) / 1000)
    const fractional = millis % 1000
    return `${minutes}:${pad(rest, 2)}${withMillis ? `.${pad(fractional, 3)}` : ""}`
  }
  const rate = RATE[format]
  const nominal = Math.round(rate)
  let frameNumber = Math.round(safe * rate)
  if (format === "29.97-drop") {
    const framesPer10Minutes = nominal * 600 - 18
    const framesPerMinute = nominal * 60 - 2
    const blocks = Math.floor(frameNumber / framesPer10Minutes)
    const remainder = frameNumber % framesPer10Minutes
    frameNumber += 18 * blocks
    if (remainder > 2) {
      frameNumber += 2 * Math.floor((remainder - 2) / framesPerMinute)
    }
  }
  const frames = frameNumber % nominal
  const totalSeconds = Math.floor(frameNumber / nominal)
  return `${pad(Math.floor(totalSeconds / 3600), 2)}:${pad(Math.floor((totalSeconds % 3600) / 60), 2)}:${pad(totalSeconds % 60, 2)}:${pad(frames, 2)}`
}
