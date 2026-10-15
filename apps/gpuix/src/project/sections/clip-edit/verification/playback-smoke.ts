import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { setTimeout as delayFor } from "node:timers/promises"
import {
  hydrateProject,
  projectActions,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createVerificationMedia } from "../demo/media"
import { seedClipEditProject } from "../demo/project"

type Workload = "normal" | "dense" | "notes-only" | "steps-only"

const delay = Number(process.env.CLIP_EDIT_PLAY_DELAY_MS ?? 0)
if (!Number.isFinite(delay) || delay < 0)
  throw new Error("Playback delay must be finite and nonnegative")
async function run(workload: Workload, iteration: number) {
  const media = createVerificationMedia()
  let release: (() => void) | undefined
  try {
    seedClipEditProject(media.uri, workload === "normal" ? "normal" : "dense")
    if (workload === "notes-only" || workload === "steps-only") {
      const state = useProjectState.getState()
      const document = structuredClone(state.document)
      for (const track of document.tracks)
        for (const clip of track.clips) {
          if (workload === "notes-only" && clip.kind === "pattern") {
            clip.lengthBars = 1
            clip.steps = Array.from({ length: 16 }, () => false)
          }
          if (workload === "steps-only" && clip.kind === "midi") {
            clip.lengthBars = 2
            clip.loopBars = 2
            clip.notes = clip.notes.slice(0, 13)
          }
        }
      hydrateProject(JSON.stringify({ version: 2, document, workspace: state.workspace }))
    }
    const snapshot = () => ({
      backend: { ...useProjectState.getState().session.backend },
      playing: useProjectState.getState().session.playing,
    })
    release = startProjectRuntime()
    const opened = await whenProjectBackendIdle()
    const open = snapshot()
    if (delay) await delayFor(delay)
    projectActions.togglePlay()
    const played = await whenProjectBackendIdle()
    const play = snapshot()
    if (play.playing) projectActions.togglePlay()
    const stopped = await whenProjectBackendIdle()
    return { workload, iteration, opened, open, played, play, stopped, stop: snapshot() }
  } finally {
    release?.()
    media.dispose()
  }
}

const results = delay
  ? [await run("dense", 1)]
  : [await run("normal", 1), await run("normal", 2), await run("dense", 1), await run("dense", 2)]
if (
  results
    .filter(result => result.workload === "normal")
    .every(result => result.played && result.play.playing) &&
  results.some(result => result.workload === "dense" && (!result.played || !result.play.playing))
) {
  results.push(await run("notes-only", 1), await run("steps-only", 1))
}
const directory = path.join(import.meta.dir, "../evidence")
mkdirSync(directory, { recursive: true })
writeFileSync(
  path.join(directory, delay ? "f4-playback-aged-diagnostic.json" : "f4-playback-diagnostic.json"),
  `${JSON.stringify({ timestamp: new Date().toISOString(), delay, results }, null, 2)}\n`
)
process.stdout.write(`${JSON.stringify(results)}\n`)
if (
  results.some(
    result =>
      !result.opened ||
      !result.played ||
      !result.play.playing ||
      !result.stopped ||
      result.stop.playing
  )
)
  process.exitCode = 1
