import { useCallback, useLayoutEffect, useState } from "react"
import { createPortal } from "@gpuix/react"
import type { PublicInstance } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button, configureToastPolicy, dismissToast, IconSlot, Toaster } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { TitleBar } from "@/ui/panels/TitleBar"
import { usePreference } from "@/platform/settings"
import { useProjectState } from "@/project/adapters"
import { projectFileName } from "@/project/model/project-file"
import { GalleryWorkspace } from "@/gallery/states"
import { HomePage } from "./home/HomePage"
import { createDisplayFormats, useAppTranslation } from "./i18n"
import { AppPreferencesProvider } from "./preferences"
import type { AppearanceStores } from "./preferences"
import { ProjectPage } from "./project/ProjectPage"
import { NotFoundPage } from "./router/NotFoundPage"
import { routePath } from "./router/route"
import { RouteErrorBoundary } from "./router/RouteErrorBoundary"
import { RouterProvider, useRoute, useRouter } from "./router/router"
import { SettingsDialog } from "./settings/SettingsDialog"
import { WorkstationMenus } from "./shell/WorkstationMenus"
import { UnsavedCloseDialog } from "./window/UnsavedCloseDialog"
import { useUnsavedCloseGuard } from "./window/useUnsavedCloseGuard"
import { ProjectFileProvider, useProjectFiles } from "./project-file/ProjectFileProvider"
import { AppInteractionProvider } from "./interaction"
import type { ProjectFileEnvironment } from "./project-file/ProjectFileProvider"
import type { ReactNode } from "react"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { ProjectLayoutSlots } from "./project/ProjectLayout"
import type { Router } from "./router/router"
import type { WindowRenderer } from "@/platform/window"
import type { ProjectShellApi } from "./project/useProjectShell"
import type { TitleBarWindow } from "@/ui/panels/TitleBar"

export interface AppShellProps {
  readonly router: Router
  readonly appearance: AppearanceStores
  readonly systemAppearance: Appearance | null
  readonly files: ProjectFileEnvironment
  readonly windowRenderer: WindowRenderer | null
  readonly titlebarWindow?: TitleBarWindow
  readonly renderProjectSlots?: (shell: ProjectShellApi) => ProjectLayoutSlots
  readonly showErrorDetails: boolean
}
export function AppShell({
  router,
  appearance,
  systemAppearance,
  files,
  windowRenderer,
  titlebarWindow,
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
              titlebarWindow={titlebarWindow}
              renderProjectSlots={renderProjectSlots}
              showErrorDetails={showErrorDetails}
              onOpenSettings={openSettings}
            >
              <SettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                onOpenGallery={() => {
                  setSettingsOpen(false)
                  router.navigate({ kind: "gallery" })
                }}
              />
            </AppFrame>
          </ProjectFileProvider>
        </AppPreferencesProvider>
      </RouterProvider>
    </AppInteractionProvider>
  )
}

function AppFrame({
  windowRenderer,
  titlebarWindow,
  renderProjectSlots,
  showErrorDetails,
  onOpenSettings,
  children,
}: Pick<
  AppShellProps,
  "windowRenderer" | "titlebarWindow" | "renderProjectSlots" | "showErrorDetails"
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
  const { t, locale } = useAppTranslation()
  const projectName = useProjectState(state =>
    state.session.filePath ? projectFileName(state.session.filePath) : state.document.name
  )
  const close = useUnsavedCloseGuard(windowRenderer, router)
  const files = useProjectFiles()
  const [viewMenuTarget, setViewMenuTarget] = useState<PublicInstance | null>(null)
  const [layoutTogglesTarget, setLayoutTogglesTarget] = useState<PublicInstance | null>(null)
  const isProject = route.kind === "project"
  const surface = isProject ? theme.colors.muted : theme.colors.background
  const viewMenuSlot = isProject ? (
    <div
      ref={setViewMenuTarget}
      style={{ display: "flex", flexDirection: "row", alignItems: "center" }}
    />
  ) : undefined
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
        title={isProject ? projectName : t("titlebar.appTitle")}
        window={titlebarWindow}
        labels={{
          minimize: t("titlebar.minimize"),
          maximizeRestore: t("titlebar.maximizeRestore"),
          close: t("titlebar.close"),
        }}
        left={
          titlebarWindow && titlebarWindow.platform !== "macos" ? (
            <WorkstationMenus
              view={viewMenuSlot}
              isProject={isProject}
              onOpenSettings={onOpenSettings}
              onOpenGallery={() => router.navigate({ kind: "gallery" })}
              onOpenHome={() => router.navigate({ kind: "home" })}
              onClose={titlebarWindow.close}
            />
          ) : undefined
        }
        actions={
          <>
            {isProject ? (
              <div
                ref={setLayoutTogglesTarget}
                style={{ display: "flex", height: "100%", alignItems: "stretch" }}
              />
            ) : null}
            <Button
              iconOnly
              variant="ghost"
              testId="titlebar-settings"
              label={t("titlebar.settings")}
              onClick={onOpenSettings}
            >
              <IconSlot>
                <Icon name="Settings" />
              </IconSlot>
            </Button>
          </>
        }
      />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <RouteErrorBoundary
          routeKey={routePath(route)}
          onHome={() => router.navigate({ kind: "home" })}
          showDetails={showErrorDetails}
        >
          {route.kind === "home" ? (
            <HomePage />
          ) : route.kind === "gallery" ? (
            <GalleryWorkspace
              locale={locale === "zh-CN" ? "zh" : "en"}
              formats={createDisplayFormats(locale)}
            />
          ) : route.kind === "project" ? (
            <ProjectPage
              key={route.projectId}
              projectId={route.projectId}
              openMode={route.openMode}
              renderSlots={renderProjectSlots}
              renderViewMenu={(view, toggles) => (
                <>
                  {viewMenuTarget ? createPortal(view, viewMenuTarget) : null}
                  {layoutTogglesTarget ? createPortal(toggles, layoutTogglesTarget) : null}
                </>
              )}
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
