import { useNavigate } from "react-router-dom"
import { useTranslation } from "@zoeymind/i18n"
import { Button, Card, Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@zoeymind/ui"
import { createUUID } from "@/shared/app-shared"
import { projectFiles, setProjectStorageId, useProjectFilesState } from "./project/adapters"
import { ProjectFileFeedback } from "./project/files"

export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const recent = useProjectFilesState(state => state.recent)
  const busy = useProjectFilesState(state => state.operation.kind === "busy")

  async function createProject() {
    if (busy || !(await projectFiles.confirmDiscard())) return
    const id = createUUID()
    setProjectStorageId(id)
    projectFiles.resetBinding(id)
    navigate(`/project/${id}`)
  }
  async function openProject(path?: string) {
    const id = await projectFiles.open(path)
    if (id) navigate(`/project/${id}`)
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("home.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("app.tagline")}</p>
        </div>
        <div className="flex gap-2">
          {import.meta.env.DEV && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => navigate("/library/realtime-probe")}
            >
              {t("realtimeProbe.title")}
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => navigate("/library")}>
            {t("home.libraryAction")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void openProject()}>
            {t("home.openAction")}
          </Button>
          <Button disabled={busy} onClick={() => void createProject()}>
            {t("home.createAction")}
          </Button>
        </div>
      </header>
      <ProjectFileFeedback />
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
              <li key={project.path}>
                <Card
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy) void openProject(project.path)
                  }}
                  onKeyDown={event => {
                    if (!busy && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault()
                      void openProject(project.path)
                    }
                  }}
                  className="hover:bg-accent/40 cursor-pointer p-4 transition"
                >
                  <div className="font-medium">{project.name}</div>
                  <div className="text-muted-foreground truncate text-xs" title={project.path}>
                    {project.path}
                  </div>
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
