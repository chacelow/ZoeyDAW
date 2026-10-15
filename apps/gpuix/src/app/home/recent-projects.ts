import type { SnapshotStorage } from "@/platform/storage"

/** Same key and shape as the web home page's localStorage entry. */
export const RECENT_PROJECTS_KEY = "zoeydaw:recent-projects"
export const RECENT_PROJECTS_LIMIT = 20

export interface RecentProject {
  readonly id: string
  readonly name: string
  readonly openedAt: number
}

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== "object" || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.openedAt === "number"
  )
}

/** Unreadable or malformed storage yields an empty list, as on the web. */
export function loadRecentProjects(storage: SnapshotStorage): RecentProject[] {
  try {
    const raw = storage.get(RECENT_PROJECTS_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isRecentProject) : []
  } catch {
    return []
  }
}

/** Moves `project` to the front, de-duplicated by id, capped at the web limit. */
export function bumpRecentProject(
  list: readonly RecentProject[],
  project: RecentProject
): RecentProject[] {
  return [project, ...list.filter(item => item.id !== project.id)].slice(0, RECENT_PROJECTS_LIMIT)
}

export function saveRecentProjects(storage: SnapshotStorage, list: readonly RecentProject[]): void {
  storage.set(RECENT_PROJECTS_KEY, JSON.stringify(list.slice(0, RECENT_PROJECTS_LIMIT)))
}
