import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  Card,
  CardTitle,
  CardDescription,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ScrollArea,
} from "@/ui/controls"
import { projectFileName } from "@/project/model/project-file"
import { createDisplayFormats, useAppTranslation } from "../i18n"
import { useRouter } from "../router/router"
import { useProjectFiles } from "../project-file/ProjectFileProvider"
import { loadRecentProjects } from "./recent-projects"

export function HomePage() {
  const theme = useTheme()
  const router = useRouter()
  const files = useProjectFiles()
  const { t, locale } = useAppTranslation()
  const [recent] = useState(() => loadRecentProjects(files.recents))
  const gap = theme.design.spacing.stackGap
  const create = () =>
    router.navigate({ kind: "project", projectId: crypto.randomUUID(), openMode: "new" })
  const formats = createDisplayFormats(locale)
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
          <CardTitle role="heading" aria-level={1}>
            {t("home.title")}
          </CardTitle>
          <CardDescription>{t("app.tagline")}</CardDescription>
        </div>
        <Button
          variant="outline"
          testId="home-open"
          label={t("home.openAction")}
          onClick={files.open}
        >
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
              {recent.map((project, index) => (
                <Card
                  key={project.path}
                  size="project"
                  testId={`recent-${index}`}
                  aria-label={projectFileName(project.path)}
                  aria-description={project.path}
                  onClick={() => files.openPath(project.path)}
                  style={{
                    width: theme.layout.home.recentCardWidth,
                  }}
                >
                  <text style={{ fontWeight: theme.design.typography.weights.medium }}>
                    {projectFileName(project.path)}
                  </text>
                  <text style={{ color: theme.colors.mutedForeground }}>
                    {formats.dateTime(project.openedAt)}
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
