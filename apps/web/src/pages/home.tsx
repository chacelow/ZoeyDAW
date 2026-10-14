/**
 * Home — 项目列表入口。
 *
 * Prototype 阶段：
 *   - 最近项目列表走 localStorage (RECENT_PROJECTS_KEY)。
 *   - "新建项目" 当场生成 uuid 直接进 /project/:id，占位空壳。
 *   - "打开" 还没接 Tauri dialog，先用 placeholder 行为。
 *
 * 等 Browser / 工程持久化需求来了，这里会换成真的从 Rust 读 project index。
 */
import { useCallback, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "@zoeymind/i18n"
import { Button, Card, Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@zoeymind/ui"
import { createUUID } from "@/shared/app-shared"

const RECENT_PROJECTS_KEY = "zoeydaw:recent-projects"

interface RecentProject {
  id: string
  name: string
  openedAt: number
}

function loadRecent(): RecentProject[] {
  if (typeof window === "undefined") {
    return []
  }
  const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as RecentProject[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecent(list: RecentProject[]): void {
  if (typeof window === "undefined") {
    return
  }
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(list.slice(0, 20)))
}

export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [recent, setRecent] = useState<RecentProject[]>(loadRecent)

  const createProject = useCallback(() => {
    const project: RecentProject = {
      id: createUUID(),
      name: t("project.untitled"),
      openedAt: Date.now(),
    }
    const next = [project, ...recent.filter(item => item.id !== project.id)]
    saveRecent(next)
    setRecent(next)
    navigate(`/project/${project.id}`)
  }, [navigate, recent, t])

  const openProject = useCallback(
    (project: RecentProject) => {
      const bumped: RecentProject = { ...project, openedAt: Date.now() }
      const next = [bumped, ...recent.filter(item => item.id !== project.id)]
      saveRecent(next)
      setRecent(next)
      navigate(`/project/${project.id}`)
    },
    [navigate, recent]
  )

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("home.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("app.tagline")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate("/library")}>
            {t("home.libraryAction", "组件库")}
          </Button>
          <Button variant="outline" onClick={createProject}>
            {t("home.openAction")}
          </Button>
          <Button onClick={createProject}>{t("home.createAction")}</Button>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium">{t("home.recent")}</h2>
        {recent.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("home.emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("home.emptyHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {recent.map(project => (
              <li key={project.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => openProject(project)}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      openProject(project)
                    }
                  }}
                  className="hover:bg-accent/40 cursor-pointer p-4 transition"
                >
                  <div className="font-medium">{project.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(project.openedAt).toLocaleString()}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
