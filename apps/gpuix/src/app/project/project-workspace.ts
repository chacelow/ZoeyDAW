import { fromJSON, getBorderTabs, getGroups } from "@/ui/panels"
import type { DockLayoutJSON } from "@/ui/panels"
import { logger } from "@/platform/log/logger"

export const PROJECT_PANELS = ["browser", "arrangement", "clipEditor", "devices"]

export function createProjectWorkspace(size: number): DockLayoutJSON {
  return {
    version: 2,
    borders: {
      left: { tabs: ["browser"], end: [], visible: true, hoverReveal: false, selected: "browser", size, type: "split" },
      right: { tabs: [], end: [], visible: true, hoverReveal: false, selected: null, size, type: "overlay" },
      bottom: { tabs: ["clipEditor", "devices"], end: [], visible: true, hoverReveal: false, selected: "clipEditor", size, type: "split" },
    },
    activeGroup: "arrangement-group",
    maximizedGroup: null,
    hidden: [],
    root: { kind: "group", id: "arrangement-group", tabs: ["arrangement"], active: "arrangement" },
  }
}

export function restoreProjectWorkspace(json: string | null, size: number): DockLayoutJSON {
  if (json === null) return createProjectWorkspace(size)
  try {
    const layout = fromJSON(JSON.parse(json))
    const ids = [...layout.hidden, ...getGroups(layout.root).flatMap(group => group.tabs), ...getBorderTabs(layout)]
    if (ids.some(id => !PROJECT_PANELS.includes(id))) throw new TypeError("Unknown workspace panel")
    if (!ids.includes("arrangement")) {
      throw new TypeError("Workspace must contain the arrangement panel")
    }
    if (!layout.borders.left || !layout.borders.right || !layout.borders.bottom) {
      return createProjectWorkspace(size)
    }
    return layout
  } catch (error) {
    logger.warn("Invalid project workspace layout; restoring default", { error })
    return createProjectWorkspace(size)
  }
}
