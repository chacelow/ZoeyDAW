import { getPreference } from "@/platform/settings"
import type { RecentProject, RecentProjectStorage } from "@/platform/storage"

export function loadRecentProjects(storage: RecentProjectStorage): readonly RecentProject[] {
  try {
    return storage.get() ?? []
  } catch {
    return []
  }
}

export function rememberRecentProject(storage: RecentProjectStorage, path: string): void {
  const list = loadRecentProjects(storage)
  storage.set(
    [{ path, openedAt: Date.now() }, ...list.filter(item => item.path !== path)].slice(
      0,
      getPreference("recentProjectCapacity")
    )
  )
}
