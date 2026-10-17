import { fromJSON, getGroups } from "@/ui/panels"
import type { DockLayoutJSON } from "@/ui/panels"
import type { LayoutTokens } from "@/shared/theme/layout-tokens"
import { logger } from "@/platform/log/logger"

export const PROJECT_PANELS = ["browser", "arrangement", "clipEditor", "devices"]

export function createProjectWorkspace(panels: LayoutTokens["project"]["panels"]): DockLayoutJSON {
  const browser = Number.parseFloat(panels.browserDefaultSize)
  const footer = Number.parseFloat(panels.clipDefaultSize)
  return {
    version: 1,
    activeGroup: "arrangement-group",
    maximizedGroup: null,
    hidden: [],
    root: {
      kind: "split", id: "workspace", orientation: "horizontal", sizes: [browser, 100 - browser],
      children: [
        { kind: "group", id: "browser-group", tabs: ["browser"], active: "browser" },
        {
          kind: "split", id: "main", orientation: "vertical", sizes: [100 - footer, footer],
          children: [
            { kind: "group", id: "arrangement-group", tabs: ["arrangement"], active: "arrangement" },
            { kind: "group", id: "editors-group", tabs: ["clipEditor", "devices"], active: "devices" },
          ],
        },
      ],
    },
  }
}

export function restoreProjectWorkspace(json: string | null, panels: LayoutTokens["project"]["panels"]): DockLayoutJSON {
  if (json === null) return createProjectWorkspace(panels)
  try {
    const layout = fromJSON(JSON.parse(json))
    const ids = [...layout.hidden, ...getGroups(layout.root).flatMap(group => group.tabs)]
    if (ids.some(id => !PROJECT_PANELS.includes(id))) throw new TypeError("Unknown workspace panel")
    if (!ids.includes("arrangement")) {
      throw new TypeError("Workspace must contain the arrangement panel")
    }
    return layout
  } catch (error) {
    logger.warn("Invalid project workspace layout; restoring default", { error })
    return createProjectWorkspace(panels)
  }
}
