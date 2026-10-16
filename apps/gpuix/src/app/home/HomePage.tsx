import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ScrollArea,
} from "@/ui/controls"
import { useAppTranslation } from "../i18n"
import { useRouter } from "../router/router"
import { bumpRecentProject, loadRecentProjects, saveRecentProjects } from "./recent-projects"
import type { SnapshotStorage } from "@/platform/storage"
import type { RecentProject } from "./recent-projects"

export interface HomePageProps {
  readonly storage: SnapshotStorage
}

/**
 * Project list entry. As on the web, "Open" has no file picker yet and also creates a project;
 * recents persist through the native data directory instead of localStorage.
 */
export function HomePage({ storage }: HomePageProps) {
  const theme = useTheme()
  const router = useRouter()
  const { t, locale } = useAppTranslation()
  const [recent, setRecent] = useState(() => loadRecentProjects(storage))
  const gap = theme.design.spacing.stackGap
  const open = (project: RecentProject, openMode?: "new") => {
    const next = bumpRecentProject(recent, { ...project, openedAt: Date.now() })
    saveRecentProjects(storage, next)
    setRecent(next)
    router.navigate({ kind: "project", projectId: project.id, ...(openMode && { openMode }) })
  }
  const create = () =>
    open({ id: crypto.randomUUID(), name: t("project.untitled"), openedAt: Date.now() }, "new")
  const formatTime = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" })
  return (
    <div
      testId="home-page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: theme.design.spacing.cardGroupGap,
        width: "100%",
        maxWidth: theme.layout.home.maxWidth,
        alignSelf: "center",
        height: "100%",
        minHeight: 0,
        padding: theme.design.spacing.rootInset,
        color: theme.colors.foreground,
        fontSize: theme.control["--text-control-track"],
      }}
    >
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", gap }}>
        <div style={{ display: "flex", flexDirection: "column", gap, flexGrow: 1, minWidth: 0 }}>
          <div
            role="heading"
            aria-level={1}
            style={{
              fontSize: theme.transportControl["--text-control-track"],
              fontWeight: theme.design.typography.weights.semibold,
            }}
          >
            {t("home.title")}
          </div>
          <text style={{ color: theme.colors.mutedForeground }}>{t("app.tagline")}</text>
        </div>
        <Button variant="outline" testId="home-open" label={t("home.openAction")} onClick={create}>
          {t("home.openAction")}
        </Button>
        <Button testId="home-create" label={t("home.createAction")} onClick={create}>
          {t("home.createAction")}
        </Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap, flexGrow: 1, minHeight: 0 }}>
        <div role="heading" aria-level={2} style={{ color: theme.colors.mutedForeground }}>
          {t("home.recent")}
        </div>
        {recent.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("home.emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("home.emptyHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea style={{ flexGrow: 1, minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap }}>
              {recent.map(project => (
                <Card
                  key={project.id}
                  size="project"
                  testId={`recent-${project.id}`}
                  aria-label={project.name}
                  onClick={() => open(project)}
                  style={{
                    width: theme.layout.home.recentCardWidth,
                  }}
                >
                  <text style={{ fontWeight: theme.design.typography.weights.medium }}>
                    {project.name}
                  </text>
                  <text style={{ color: theme.colors.mutedForeground }}>
                    {formatTime.format(project.openedAt)}
                  </text>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
