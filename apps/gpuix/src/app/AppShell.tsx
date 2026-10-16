import { useCallback, useLayoutEffect, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { configureToastPolicy, dismissToast, Toaster } from "@/ui/controls"
import { usePreference } from "@/platform/settings"
import { useProjectState } from "@/project/adapters"
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
import type { ReactNode } from "react"
import type { SnapshotStorage } from "@/platform/storage"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { ProjectLayoutSlots } from "./project/ProjectLayout"
import type { Router } from "./router/router"
import type { WindowRenderer } from "@/platform/window"
import type { ProjectShellApi } from "./project/useProjectShell"

export interface AppShellProps {
  readonly router: Router
  readonly appearance: AppearanceStores
  readonly systemAppearance: Appearance | null
  /** Durable app data (recent projects); the native data directory in production. */
  readonly storage: SnapshotStorage
  /** Window close interception; `null` leaves closing unguarded. */
  readonly closeRenderer: WindowRenderer | null
  readonly renderProjectSlots?: (shell: ProjectShellApi) => ProjectLayoutSlots
  /** Show raw route-error messages (web shows them only in DEV). */
  readonly showErrorDetails: boolean
}

/** Everything below the render root: preferences, routes, titlebar, dialogs. */
export function AppShell({
  router,
  appearance,
  systemAppearance,
  storage,
  closeRenderer,
  renderProjectSlots,
  showErrorDetails,
}: AppShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  return (
    <AppInteractionProvider>
      <RouterProvider value={router}>
        <AppPreferencesProvider stores={appearance} systemAppearance={systemAppearance}>
          <AppFrame
            storage={storage}
            closeRenderer={closeRenderer}
            renderProjectSlots={renderProjectSlots}
            showErrorDetails={showErrorDetails}
            onOpenSettings={openSettings}
          >
            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
          </AppFrame>
        </AppPreferencesProvider>
      </RouterProvider>
    </AppInteractionProvider>
  )
}

function AppFrame({
  storage,
  closeRenderer,
  renderProjectSlots,
  showErrorDetails,
  onOpenSettings,
  children,
}: Pick<AppShellProps, "storage" | "closeRenderer" | "renderProjectSlots" | "showErrorDetails"> & {
  readonly onOpenSettings: () => void
  /** App-level overlays; they must stay inside this frame, the window root's only host child. */
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
  const projectName = useProjectState(state => state.document.name)
  const close = useUnsavedCloseGuard(closeRenderer, router)
  const isProject = route.kind === "project"
  const surface = isProject ? theme.colors.muted : theme.colors.background
  return (
    <div
      testId="app-frame"
      style={{
        // Full extents and flex shrink minima are structural containment, not layout defaults.
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: surface,
        color: theme.colors.foreground,
        fontSize: theme.control["--text-control-track"],
      }}
    >
      <TitleBar
        title={isProject ? projectName : undefined}
        settingsLabel={t("titlebar.settings")}
        onOpenSettings={onOpenSettings}
        surface={surface}
      />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <RouteErrorBoundary
          routeKey={routePath(route)}
          onHome={() => router.navigate({ kind: "home" })}
          showDetails={showErrorDetails}
        >
          {route.kind === "home" ? (
            <HomePage storage={storage} />
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
