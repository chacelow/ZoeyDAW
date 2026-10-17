import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "@/ui/controls"
import { isProjectFile, projectFileName } from "@/project/model/project-file"
import { projectActions, useProjectState, whenProjectBackendIdle } from "@/project/adapters"
import { useAppTranslation } from "../i18n"
import { useRouter } from "../router/router"
import { rememberRecentProject } from "../home/recent-projects"
import { SaveAsDialog } from "./SaveAsDialog"
import type { ReactNode } from "react"
import type { ProjectLocations, RecentProjectStorage } from "@/platform/storage"
import type { WindowRenderer } from "@/platform/window"

export interface ProjectFileEnvironment {
  readonly recents: RecentProjectStorage
  readonly locations: ProjectLocations
}

interface ProjectFileCommands {
  readonly recents: RecentProjectStorage
  open(): void
  openPath(path: string): void
  save(): Promise<boolean>
  readonly dialog: ReactNode
}

const ProjectFileContext = createContext<ProjectFileCommands | null>(null)

export function useProjectFiles(): ProjectFileCommands {
  const commands = useContext(ProjectFileContext)
  if (!commands) throw new Error("ProjectFileProvider is missing")
  return commands
}

export function ProjectFileProvider({
  environment,
  renderer,
  children,
}: {
  readonly environment: ProjectFileEnvironment
  readonly renderer: Pick<WindowRenderer, "promptForPaths"> | null
  readonly children: ReactNode
}) {
  const { t } = useAppTranslation()
  const router = useRouter()
  const { recents, locations } = environment
  const [choosing, setChoosing] = useState<((path: string | null) => void) | null>(null)
  const saveAsRequest = useProjectState(state => state.session.saveAsRequest)
  const openRequest = useProjectState(state => state.session.openRequest)
  const filePath = useProjectState(state => state.session.filePath)
  const documentName = useProjectState(state => state.document.name)
  const handled = useRef({ saveAs: saveAsRequest, open: openRequest })

  const chooseSavePath = useCallback(
    () =>
      new Promise<string | null>(resolve => {
        setChoosing(() => resolve)
      }),
    []
  )
  const openPath = useCallback(
    (path: string) => {
      if (!isProjectFile(path)) {
        toast.error(t("projectFile.notProject"))
        return
      }
      router.navigate({ kind: "project", projectId: path })
    },
    [router, t]
  )
  const open = useCallback(() => {
    if (!renderer?.promptForPaths) return
    void renderer.promptForPaths({ files: true, prompt: t("home.openPrompt") }).then(paths => {
      if (paths?.[0]) openPath(paths[0])
    })
  }, [openPath, renderer, t])
  const save = useCallback(async () => {
    const { filePath: current, saveBlocked } = useProjectState.getState().session
    if (current === null || saveBlocked) {
      const path = await chooseSavePath()
      if (path === null) return false
      projectActions.saveAs(path)
    } else {
      projectActions.save()
    }
    if (!(await whenProjectBackendIdle())) return false
    const { dirty, fileError } = useProjectState.getState().session
    return !dirty && fileError === null
  }, [chooseSavePath])

  useLayoutEffect(() => {
    const previous = handled.current
    handled.current = { saveAs: saveAsRequest, open: openRequest }
    if (saveAsRequest > previous.saveAs) {
      void chooseSavePath().then(path => {
        if (path !== null) projectActions.saveAs(path)
      })
    }
    if (openRequest > previous.open) open()
  }, [saveAsRequest, openRequest, open, chooseSavePath])

  useLayoutEffect(() => {
    if (filePath !== null) rememberRecentProject(recents, filePath)
  }, [filePath, recents])

  const finish = useCallback(
    (path: string | null) => {
      setChoosing(null)
      choosing?.(path)
    },
    [choosing]
  )
  const chooseDirectory = useMemo(() => {
    const prompt = renderer?.promptForPaths
    if (!prompt) return null
    return () =>
      prompt
        .call(renderer, { directories: true, files: false, prompt: t("projectFile.choosePrompt") })
        .then(paths => paths?.[0] ?? null)
  }, [renderer, t])
  const dialog = useMemo(
    () =>
      choosing ? (
        <SaveAsDialog
          initialName={filePath ? projectFileName(filePath) : documentName}
          initialDirectory={
            filePath
              ? filePath.replace(/[\\/][^\\/]*[\\/][^\\/]*$/u, "")
              : locations.defaultDirectory
          }
          locations={locations}
          chooseDirectory={chooseDirectory}
          onCancel={() => finish(null)}
          onSave={finish}
        />
      ) : null,
    [choosing, filePath, documentName, locations, chooseDirectory, finish]
  )
  const commands = useMemo(
    () => ({ recents, open, openPath, save, dialog }),
    [recents, open, openPath, save, dialog]
  )
  return <ProjectFileContext.Provider value={commands}>{children}</ProjectFileContext.Provider>
}
