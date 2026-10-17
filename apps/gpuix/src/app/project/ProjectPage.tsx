import { useLayoutEffect, useRef } from "react"
import {
  configureProjectCreation,
  openProjectFile,
  openNewProject,
  startProjectRuntime,
} from "@/project/adapters"
import { getPreferences } from "@/platform/settings"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { useAppTranslation } from "../i18n"
import { getCreationNames } from "../i18n/creation-names"
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

export function ProjectPage({ projectId, openMode, renderSlots }: ProjectPageProps) {
  const shell = useProjectShell()
  const { t, locale } = useAppTranslation()
  const theme = useTheme()
  const creation = useRef({ locale, theme })
  useLayoutEffect(() => {
    creation.current = { locale, theme }
  }, [locale, theme])
  useLayoutEffect(() => {
    const releaseCreation = configureProjectCreation({
      names: () => getCreationNames(creation.current.locale),
      appearance: () => {
        const current = creation.current.theme
        return {
          heightPx: current.layout.track.defaultHeight,
          mainHeightPx: current.layout.track.mainHeight,
          colors: current.design.trackCreationColors,
        }
      },
      preferences: getPreferences,
    })
    let releaseRuntime: () => void
    try {
      if (openMode === "new") openNewProject(projectId)
      else openProjectFile(projectId)
      releaseRuntime = startProjectRuntime()
    } catch (error) {
      releaseCreation()
      throw error
    }
    return () => {
      try {
        releaseRuntime()
      } finally {
        releaseCreation()
      }
    }
  }, [projectId, openMode])
  const { composition, browserRef, focusRef } = useProjectComposition(shell)
  const labels = {
    browserPanel: t("panel.browser"),
    arrangementPanel: t("panel.arrangement"),
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
