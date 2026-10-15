import {
  readProjectPeaks,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createVerificationMedia } from "../demo/media"
import { seedLaneProject } from "../demo/project"

const media = createVerificationMedia()
try {
  seedLaneProject(media.uri, true)
  const release = startProjectRuntime()
  try {
    if (!(await whenProjectBackendIdle()))
      throw new Error("Native backend did not accept the authored project")
    const state = useProjectState.getState()
    const editable = state.document.tracks.filter(
      track => track.kind === "audio" || track.kind === "midi"
    )
    const total = editable.reduce((sum, track) => sum + track.clips.length, 0)
    if (
      editable.length !== 200 ||
      total !== 10000 ||
      editable.some(track => track.clips.length !== 50)
    )
      throw new Error("Stress content was reduced")
    const audio = editable.flatMap(track => track.clips).find(clip => clip.kind === "audio")
    if (!audio || audio.kind !== "audio") throw new Error("Audio source is missing")
    const pixels = 128
    const peaks = readProjectPeaks(audio.samplePath, 1, 1.5, pixels, audio.sourceOffsetBars ?? 0)
    if (peaks.length !== pixels * 4) throw new Error("Native stereo envelope layout is invalid")
    let left = 0
    let right = 0
    for (let index = 0; index < pixels * 2; index++)
      left = Math.max(left, Math.abs(peaks[index] ?? 0))
    for (let index = pixels * 2; index < peaks.length; index++)
      right = Math.max(right, Math.abs(peaks[index] ?? 0))
    if (!(left > 0.6 && left < 0.7 && right > 0.35 && right < 0.45))
      throw new Error("Native envelopes do not match the real stereo source")
    process.stdout.write(
      `${JSON.stringify({ event: "lane-native-backend-smoke", editableTracks: editable.length, clips: total, backend: state.session.backend.phase, peakSamples: peaks.length, leftPeak: left, rightPeak: right })}\n`
    )
  } finally {
    release()
  }
} finally {
  media.dispose()
}
