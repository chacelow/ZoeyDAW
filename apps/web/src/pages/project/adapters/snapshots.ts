import { parseProject, stringifyProject } from "@zoeydaw/project-core/persistence"
import { getCommittedDocument, getCommittedWorkspace, hydrateState, resetProject } from "./context"
import { withWaveformPreview } from "@zoeydaw/project-runtime/visuals"

let storageId: string | null = null

export function setProjectStorageId(projectId: string): void {
  if (storageId === projectId) return
  resetProject(projectId)
  storageId = projectId
}

export function adoptProjectStorageId(projectId: string): void {
  storageId = projectId
}

export function serializeProject(): string {
  return stringifyProject(getCommittedDocument(), getCommittedWorkspace())
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
          clip.kind === "audio" ? withWaveformPreview(clip, parsed.document.media) : clip
        ),
      })),
    },
  })
}
