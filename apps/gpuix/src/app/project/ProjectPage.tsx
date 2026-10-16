import { useLayoutEffect } from "react"
import { openProjectSnapshot, setProjectStorageId, startProjectRuntime } from "@/project/adapters"
import { useAppTranslation } from "../i18n"
import { ProjectLayout } from "./ProjectLayout"
import { useProjectComposition } from "./useProjectComposition"
import { ProjectSections } from "./ProjectSections"
import { useProjectShell } from "./useProjectShell"
import type { ProjectLayoutSlots } from "./ProjectLayout"
import type { ProjectShellApi } from "./useProjectShell"

export interface ProjectPageProps {
  readonly projectId: string
  readonly openMode?: "new"
  readonly renderSlots?: (shell: ProjectShellApi) => ProjectLayoutSlots
}

/**
 * Route entry: isolates the project's editing session and snapshot key, then holds a runtime
 * lease (opening the native backend) for exactly as long as the view is mounted.
 */
export function ProjectPage({ projectId, openMode, renderSlots }: ProjectPageProps) {
  const shell = useProjectShell()
  const { t } = useAppTranslation()
  useLayoutEffect(() => {
    if (openMode === "new") setProjectStorageId(projectId)
    else openProjectSnapshot(projectId)
    return startProjectRuntime()
  }, [projectId, openMode])
  const { composition, browserRef, focusRef } = useProjectComposition(shell)
  const labels = {
    resizeBrowser: t("project.resizeBrowser"),
    resizeClipEdit: t("project.resizeClipEdit"),
    browserPanel: "Browser",
    arrangementPanel: "Arrangement",
    footerPanel: "Footer",
    activeDescription: "Active panel",
  }
  if (!renderSlots)
    return composition ? (
      <ProjectSections
        composition={composition}
        browserRef={browserRef}
        focusRef={focusRef}
        projectId={projectId}
        shell={shell}
        labels={labels}
      />
    ) : null
  return (
    <ProjectLayout
      {...renderSlots(shell)}
      projectId={projectId}
      shell={shell}
      focusRef={focusRef}
      labels={labels}
    />
  )
}
