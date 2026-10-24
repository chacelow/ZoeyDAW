import { z } from "zod"
import { parseProject, stringifyProject } from "@zoeydaw/project-core/persistence"
import { isMediaSource } from "@zoeydaw/project-core/media"
import type { MediaSource } from "@zoeydaw/project-core/media"
import type { DocumentState, WorkspaceState } from "@zoeydaw/project-core/types"

export interface ProjectManifest {
  format: "zoeydaw-project"
  version: 1
  projectId: string
  commitId: string
  project: { version: 4; document: DocumentState; workspace: WorkspaceState }
}
export interface MediaIssue {
  sourceId: string
  kind: "missing" | "changed" | "unreadable"
  path: string
}
export interface OpenedProject {
  path: string
  manifest: ProjectManifest
  issues: MediaIssue[]
}
export interface SavedProject {
  path: string
  manifest: ProjectManifest
  durability: "synced" | "published-sync-uncertain"
}
const manifestSchema = z.object({
  format: z.literal("zoeydaw-project"),
  version: z.literal(1),
  projectId: z.string().min(1),
  commitId: z.string().min(1),
  project: z.object({
    version: z.union([z.literal(3), z.literal(4)]),
    document: z.unknown(),
    workspace: z.unknown(),
  }),
})
const openedSchema = z.object({
  path: z.string().min(1),
  manifest: z.unknown(),
  issues: z.array(
    z.object({
      sourceId: z.string().min(1),
      kind: z.enum(["missing", "changed", "unreadable"]),
      path: z.string(),
    })
  ),
})
const savedSchema = z.object({
  path: z.string().min(1),
  manifest: z.unknown(),
  durability: z.enum(["synced", "published-sync-uncertain"]),
})

export function parseManifest(value: unknown): ProjectManifest {
  const manifest = manifestSchema.parse(value)
  const project = parseProject(JSON.stringify(manifest.project))
  if (project.document.media.some(source => source.location.kind === "fixture")) {
    throw new Error("Gallery media cannot be stored in a real project")
  }
  return { ...manifest, project: { version: 4, ...project } }
}

export function createManifest(
  projectId: string,
  document: DocumentState,
  workspace: WorkspaceState
): ProjectManifest {
  return parseManifest({
    format: "zoeydaw-project",
    version: 1,
    projectId,
    commitId: crypto.randomUUID(),
    project: JSON.parse(stringifyProject(document, workspace)),
  })
}

export function parseOpenedProject(value: unknown): OpenedProject {
  const opened = openedSchema.parse(value)
  const manifest = parseManifest(opened.manifest)
  if (manifest.project.document.media.some(source => source.location.kind !== "external")) {
    throw new Error("Native open did not resolve project media paths")
  }
  if (
    opened.issues.some(
      issue => !manifest.project.document.media.some(source => source.id === issue.sourceId)
    )
  ) {
    throw new Error("Media issue references an unknown source")
  }
  return { ...opened, manifest }
}

export function parseSavedProject(value: unknown): SavedProject {
  const saved = savedSchema.parse(value)
  return { ...saved, manifest: parseManifest(saved.manifest) }
}

export function parseExternalMedia(value: unknown): MediaSource {
  if (
    !isMediaSource(value) ||
    value.location.kind !== "external" ||
    !/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(value.location.path) ||
    value.frames <= 0
  ) {
    throw new Error("Invalid native audio inspection response")
  }
  return value
}
