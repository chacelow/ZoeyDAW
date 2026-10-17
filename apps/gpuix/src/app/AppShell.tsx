import { useCallback, useLayoutEffect, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { configureToastPolicy, dismissToast, Toaster } from "@/ui/controls"
import { usePreference } from "@/platform/settings"
import { useProjectState } from "@/project/adapters"
import { projectFileName } from "@/project/model/project-file"
import { HomePage } from "./home/HomePage"
import { useAppTranslation } from "./i18n"
import { AppPreferencesProvider } from "./preferences"
import type { AppearanceStores } from "./preferences"
import { ProjectPage } from "./project/ProjectPage"
import { NotFoundPage } from "./router/NotFoundPage"
import { routePath } from "./router/route"
import { RouteErrorBoundary } from "./router/RouteErrorBoundary"
import { RouterProvider, useRoute, useRouter } from "./router/router"
import { SettingsDialog } from "./settings/SettingsDialog"
import { TitleBar } from "./shell/TitleBar"
import { UnsavedCloseDialog } from "./window/UnsavedCloseDialog"
import { useUnsavedCloseGuard } from "./window/useUnsavedCloseGuard"
import { AppInteractionProvider } from "./interaction"
import { ProjectFileProvider, useProjectFiles } from "./project-file/ProjectFileProvider"
import type { ProjectFileEnvironment } from "./project-file/ProjectFileProvider"
import type { ReactNode } from "react"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { ProjectLayoutSlots } from "./project/ProjectLayout"
import type { Router } from "./router/router"
import type { WindowRenderer } from "@/platform/window"
import type { ProjectShellApi } from "./project/useProjectShell"

export interface AppShellProps {
  readonly router: Router
  readonly appearance: AppearanceStores
  readonly systemAppearance: Appearance | null
  readonly files: ProjectFileEnvironment
  readonly windowRenderer: WindowRenderer | null
  readonly onTitlebarDoubleClick?: () => void
  readonly renderProjectSlots?: (shell: ProjectShellApi) => ProjectLayoutSlots
  readonly showErrorDetails: boolean
}

export function AppShell({
  router,
  appearance,
  systemAppearance,
  files,
  windowRenderer,
  onTitlebarDoubleClick,
  renderProjectSlots,
  showErrorDetails,
}: AppShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  return (
    <AppInteractionProvider>
      <RouterProvider value={router}>
        <AppPreferencesProvider stores={appearance} systemAppearance={systemAppearance}>
          <ProjectFileProvider environment={files} renderer={windowRenderer}>
            <AppFrame
              windowRenderer={windowRenderer}
              onTitlebarDoubleClick={onTitlebarDoubleClick}
              renderProjectSlots={renderProjectSlots}
              showErrorDetails={showErrorDetails}
              onOpenSettings={openSettings}
            >
              <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
            </AppFrame>
          </ProjectFileProvider>
        </AppPreferencesProvider>
      </RouterProvider>
    </AppInteractionProvider>
  )
}

function AppFrame({
  windowRenderer,
  onTitlebarDoubleClick,
  renderProjectSlots,
  showErrorDetails,
  onOpenSettings,
  children,
}: Pick<
  AppShellProps,
  "windowRenderer" | "onTitlebarDoubleClick" | "renderProjectSlots" | "showErrorDetails"
> & {
  readonly onOpenSettings: () => void
  readonly children: ReactNode
}) {
  const theme = useTheme()
  const policy = usePreference("notifications")
  useLayoutEffect(() => {
    configureToastPolicy(policy)
  }, [policy])
  useLayoutEffect(() => () => dismissToast(), [])
  const route = useRoute()
  const router = useRouter()
  const { t } = useAppTranslation()
  const projectName = useProjectState(state =>
    state.session.filePath ? projectFileName(state.session.filePath) : state.document.name
  )
  const close = useUnsavedCloseGuard(windowRenderer, router)
  const files = useProjectFiles()
  const isProject = route.kind === "project"
  const surface = isProject ? theme.colors.muted : theme.colors.background
  return (
    <div
      testId="app-frame"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: surface,
        color: theme.colors.foreground,
        fontSize: theme.control["--text-control-track"],
        userSelect: "none",
      }}
    >
      <TitleBar
        title={isProject ? projectName : undefined}
        settingsLabel={t("titlebar.settings")}
        onOpenSettings={onOpenSettings}
        onTitlebarDoubleClick={onTitlebarDoubleClick}
        surface={surface}
      />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <RouteErrorBoundary
          routeKey={routePath(route)}
          onHome={() => router.navigate({ kind: "home" })}
          showDetails={showErrorDetails}
        >
          {route.kind === "home" ? (
            <HomePage />
          ) : route.kind === "project" ? (
            <ProjectPage
              key={route.projectId}
              projectId={route.projectId}
              openMode={route.openMode}
              renderSlots={renderProjectSlots}
            />
          ) : (
            <NotFoundPage />
          )}
        </RouteErrorBoundary>
      </div>
      <UnsavedCloseDialog open={close.asking} onChoose={choice => void close.choose(choice)} />
      {files.dialog}
      <Toaster
        policy={policy}
        position="bottom-left"
        aria-label={t("notifications.title")}
        dismissLabel={t("notifications.dismiss")}
        loadingLabel={t("notifications.loading")}
      />
      {children}
    </div>
  )
}
