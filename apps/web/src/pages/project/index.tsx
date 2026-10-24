/**
 * ProjectPage — 路由入口，持 URL 解析 + 顶层状态，组装 ProjectLayout。
 *
 * 真正的面板结构在 `ProjectLayout.tsx`；状态在 `useProjectShell.ts`。
 */
import { useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  projectFiles,
  setProjectStorageId,
  startProjectRuntime,
  useProjectFilesState,
} from "./adapters"
import { ProjectLayout } from "./ProjectLayout"
import { useProjectShell } from "./useProjectShell"
import { ProjectFileFeedback } from "./files"

export function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shell = useProjectShell()
  useEffect(() => {
    const projectId = id ?? "default"
    setProjectStorageId(projectId)
    if (useProjectFilesState.getState().binding?.projectId !== projectId)
      projectFiles.resetBinding(projectId)
    return startProjectRuntime()
  }, [id])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectFileFeedback showDependencies />
      <div className="min-h-0 flex-1">
        <ProjectLayout
          projectId={id ?? ""}
          shell={shell}
          onBack={() => {
            if (useProjectFilesState.getState().operation.kind === "busy") return
            void projectFiles.confirmDiscard().then(leave => {
              if (!leave) return
              const emptyId = crypto.randomUUID()
              setProjectStorageId(emptyId)
              projectFiles.resetBinding(emptyId)
              navigate("/")
            })
          }}
        />
      </div>
    </div>
  )
}
