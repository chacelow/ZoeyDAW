import type { RecentProject } from "@/platform/storage"
import type { ProjectFileEnvironment } from "./ProjectFileProvider"

export function createMemoryFileEnvironment(
  existing: (path: string) => boolean = () => false
): ProjectFileEnvironment & { readonly recentPaths: () => string[] } {
  let recents: readonly RecentProject[] = []
  return {
    recents: {
      get: () => recents,
      set: list => {
        recents = list
      },
    },
    locations: {
      defaultDirectory: "/projects",
      filePath: (directory, name) =>
        name.trim() === name && name !== "" && !/[\\/:*?"<>|]/u.test(name)
          ? `${directory}/${name} Project/${name}.zdaw`
          : null,
      exists: existing,
    },
    recentPaths: () => recents.map(item => item.path),
  }
}
