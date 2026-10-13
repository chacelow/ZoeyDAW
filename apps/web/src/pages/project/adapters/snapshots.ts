import { parseProject, stringifyProject } from "../model/persistence"
import { get, hydrateState, resetProject, session } from "./context"
import { mockWaveformPeaks } from "./fixtures"

let storageId: string | null = null
const storageKey = () => `zoeydaw:project:snapshot:v1:${encodeURIComponent(storageId ?? "default")}`

/** Changing project route isolates its in-memory editing session and browser snapshot key. */
export function setProjectStorageId(projectId: string): void {
  if (storageId === projectId) return
  storageId = projectId
  resetProject()
}
export function serializeProject(): string {
  const state = get()
  return stringifyProject(state.document, state.workspace)
}
export function hydrateProject(json: string): void {
  const parsed = parseProject(json)
  hydrateState({
    ...parsed,
    document: {
      ...parsed.document,
      tracks: parsed.document.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip =>
          clip.kind === "audio"
            ? {
                ...clip,
                waveformPeaks: mockWaveformPeaks(
                  clip.samplePath,
                  clip.sourceOffsetBars ?? 0,
                  clip.lengthBars
                ),
              }
            : clip
        ),
      })),
    },
  })
}
export const snapshotActions = {
  saveSnapshot(): void {
    try {
      localStorage.setItem(storageKey(), serializeProject())
      session({ dirty: false, snapshotError: null })
    } catch {
      session({
        snapshotError: "Could not save the local snapshot. Check browser storage availability.",
      })
    }
  },
  restoreSnapshot(): boolean {
    let saved: string | null
    try {
      saved = localStorage.getItem(storageKey())
    } catch {
      session({ snapshotError: "Could not read browser storage." })
      return false
    }
    if (saved === null) {
      session({ snapshotError: "No local snapshot exists for this project." })
      return false
    }
    try {
      hydrateProject(saved)
      return true
    } catch {
      session({
        snapshotError: "The local snapshot is invalid or unsupported. Current project was kept.",
      })
      return false
    }
  },
}
