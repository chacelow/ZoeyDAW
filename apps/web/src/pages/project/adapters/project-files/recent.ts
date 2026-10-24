import { z } from "zod"

export interface RecentProject {
  id: string
  name: string
  path: string
  openedAt: number
}
const key = "zoeydaw:recent-project-files:v1"
const recentSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string(),
    path: z.string().min(1),
    openedAt: z.number().finite(),
  })
)

export function readRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? [] : recentSchema.parse(JSON.parse(raw))
  } catch {
    return []
  }
}

export function rememberProject(project: Omit<RecentProject, "openedAt">): RecentProject[] {
  const next = [
    { ...project, openedAt: Date.now() },
    ...readRecentProjects().filter(item => item.path !== project.path),
  ].slice(0, 20)
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // Disk persistence has succeeded; an unavailable recent-list cache cannot undo it.
  }
  return next
}
