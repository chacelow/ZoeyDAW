/**
 * ProjectPage — 路由入口，持 URL 解析 + 顶层状态，组装 ProjectLayout。
 *
 * 真正的面板结构在 `ProjectLayout.tsx`；状态在 `useProjectShell.ts`。
 */
import { useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { setProjectStorageId, startProjectRuntime } from "./adapters"
import { ProjectLayout } from "./ProjectLayout"
import { useProjectShell } from "./useProjectShell"

export function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shell = useProjectShell()
  useEffect(() => {
    setProjectStorageId(id ?? "default")
    return startProjectRuntime()
  }, [id])

  return <ProjectLayout projectId={id ?? ""} shell={shell} onBack={() => navigate("/")} />
}
