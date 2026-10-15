import { useLayoutEffect } from "react"
import { setProjectStorageId, startProjectRuntime } from "@/project/adapters"
import { useAppTranslation } from "../i18n"
import { ProjectLayout } from "./ProjectLayout"
import { usePlaybackKey } from "./usePlaybackKey"
import { useProjectShell } from "./useProjectShell"
import type { ProjectLayoutSlots } from "./ProjectLayout"
import type { ProjectShellApi } from "./useProjectShell"

export interface ProjectPageProps {
  readonly projectId: string
  /** Section nodes for the current shell state; phase 2's composition root supplies them. */
  readonly renderSlots: (shell: ProjectShellApi) => ProjectLayoutSlots
}

/**
 * Route entry: isolates the project's editing session and snapshot key, then holds a runtime
 * lease (opening the native backend) for exactly as long as the view is mounted.
 */
export function ProjectPage({ projectId, renderSlots }: ProjectPageProps) {
  const shell = useProjectShell()
  const { t } = useAppTranslation()
  usePlaybackKey()
  useLayoutEffect(() => {
    setProjectStorageId(projectId)
    return startProjectRuntime()
  }, [projectId])
  return (
    <ProjectLayout
      {...renderSlots(shell)}
      projectId={projectId}
      shell={shell}
      labels={{
        resizeBrowser: t("project.resizeBrowser"),
        resizeClipEdit: t("project.resizeClipEdit"),
      }}
    />
  )
}
