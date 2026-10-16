import { getPreference } from "@/platform/settings"
import type { SnapshotStorage } from "@/platform/storage"

/** This storage namespace preserves existing recent-project entries across upgrades. */
export const RECENT_PROJECTS_KEY = "zoeydaw:recent-projects"

export interface RecentProject {
  readonly id: string
  readonly name: string
  readonly openedAt: number
}

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== "object" || value === null) return false
  if (!("id" in value && "name" in value && "openedAt" in value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.openedAt === "number"
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

/** Moves a project to the front, de-duplicated by id, using the selected capacity. */
export function bumpRecentProject(
  list: readonly RecentProject[],
  project: RecentProject
): RecentProject[] {
  return [project, ...list.filter(item => item.id !== project.id)].slice(
    0,
    getPreference("recentProjectCapacity")
  )
}

export function saveRecentProjects(storage: SnapshotStorage, list: readonly RecentProject[]): void {
  storage.set(
    RECENT_PROJECTS_KEY,
    JSON.stringify(list.slice(0, getPreference("recentProjectCapacity")))
  )
}
