import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { render } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { i18next } from "@zoeymind/i18n/core"
import { createMemorySnapshotStorage } from "@/project/adapters"
import { LAUNCH_FOCUS } from "@/platform/window"
import { createSceneStore } from "@/project/sections/arrangement/core/scene"
import { createTimelineController } from "@/project/sections/arrangement/timeline/controller"
import { englishLabels } from "@/project/sections/arrangement/timeline/demo-labels"
import { Rulers, TimeRuler } from "@/project/sections/arrangement/timeline/rulers"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { HomePage } from "../home/HomePage"
import { saveRecentProjects } from "../home/recent-projects"
import { initAppI18n } from "../i18n"
import { AppInteractionProvider } from "../interaction"
import { AppPreferencesProvider } from "../preferences"
import { createRouter, RouterProvider } from "../router/router"
import { RouteErrorBoundary } from "../router/RouteErrorBoundary"
import { NotFoundPage } from "../router/NotFoundPage"
import { SettingsDialog } from "../settings/SettingsDialog"
import { createPreferenceStore } from "../settings/preference-store"
import { isThemeMode } from "../settings/theme-mode"
import { UnsavedCloseDialog } from "../window/UnsavedCloseDialog"
import type { ReactNode } from "react"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { ThemeMode } from "@/platform/settings"

const surfaces = ["home", "settings", "unsaved", "error", "not-found", "rulers"] as const
const storage = createMemorySnapshotStorage()
saveRecentProjects(storage, [
  { id: "design-session", name: "Studio session", openedAt: 1_760_000_000_000 },
  { id: "design-sketch", name: "Arrangement sketch", openedAt: 1_760_000_000_000 },
])
const router = createRouter()
const stores = {
  themeMode: createPreferenceStore<ThemeMode>(
    { get: () => "dark", set: () => {} },
    isThemeMode,
    "dark"
  ),
  themePreset: createPreferenceStore(
    { get: () => DEFAULT_THEME_PRESET, set: () => {} },
    isThemePresetId,
    DEFAULT_THEME_PRESET
  ),
}
const scene = createSceneStore()
scene.setViewport({ width: 1100, height: 320, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
const owner = createTimelineController({
  sceneStore: scene,
  initialSize: { containerWidth: 1404, bodyHeight: 320, timelineLeft: 0 },
  metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
  keyboard: { focus: () => "timeline", blurControl: () => {} },
  subscribeWindowActive: () => () => {},
})
function FailedRoute(): never {
  throw new Error("The project could not be opened. Retry or return to Home.")
}
function Surface({ name }: { name: (typeof surfaces)[number] }) {
  switch (name) {
    case "home":
      return <HomePage storage={storage} />
    case "settings":
      return <SettingsDialog open onOpenChange={() => {}} />
    case "unsaved":
      return <UnsavedCloseDialog open onChoose={() => {}} />
    case "error":
      return (
        <RouteErrorBoundary routeKey="evidence" onHome={() => {}} showDetails>
          <FailedRoute />
        </RouteErrorBoundary>
      )
    case "not-found":
      return <NotFoundPage />
    case "rulers":
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Rulers owner={owner} labels={englishLabels} />
          <TimeRuler scene={scene} label="Time ruler" />
        </div>
      )
  }
}
function Background({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: theme.colors.background }}>
      {children}
    </div>
  )
}
function Providers({ appearance, children }: { appearance: Appearance; children: ReactNode }) {
  return (
    <AppPreferencesProvider stores={stores} systemAppearance={appearance}>
      <ThemeProvider appearance={appearance}>
        <RouterProvider value={router}>
          <AppInteractionProvider>
            <Background>{children}</Background>
          </AppInteractionProvider>
        </RouterProvider>
      </ThemeProvider>
    </AppPreferencesProvider>
  )
}
initAppI18n({ initialLanguage: "en", storage: { get: () => "en", set: () => {} } })
await i18next.changeLanguage("en")
const requested = process.env.T1_SURFACE
if (requested) {
  const name = surfaces.find(item => item === requested)
  if (!name) throw new Error(`Unknown surface ${requested}`)
  render(
    <Providers appearance={process.env.T1_APPEARANCE === "light" ? "light" : "dark"}>
      <Surface name={name} />
    </Providers>,
    {
      title: `T1 ${name}`,
      width: 1100,
      height: 740,
      ...LAUNCH_FOCUS,
    }
  )
} else {
  const directory = process.argv[2]
  if (!directory) throw new Error("Pass an external evidence directory")
  mkdirSync(directory, { recursive: true })
  const root = createTestRoot({ width: 1100, height: 740 })
  const captureLocale = async (locale: string) => {
    await i18next.changeLanguage(locale)
    for (const appearance of ["dark", "light"] as const) {
      for (const name of surfaces) {
        root.render(
          <Providers key={`${locale}-${appearance}-${name}`} appearance={appearance}>
            <Surface name={name} />
          </Providers>
        )
        for (let frame = 0; frame < 3; frame++) {
          root.renderer.flush()
          root.renderer.dispatchNativeEvents()
        }
        const key = `${name}-${appearance}-${locale}`
        root.renderer.captureScreenshot(path.join(directory, `${key}.png`))
        writeFileSync(
          path.join(directory, `${key}.json`),
          JSON.stringify(
            {
              a11y: root.renderer.getA11yTree(),
              stats: root.renderer.getDebugFrameOverlayStats(),
              nodes: root.renderer.findByType("div").map(node => ({
                testId: node.testId,
                style: node.style,
                bounds: root.renderer.getElementBounds(node.id),
              })),
            },
            null,
            2
          )
        )
        console.log(`Captured ${key}`)
      }
    }
  }
  try {
    await captureLocale("en")
    await captureLocale("zh-CN")
  } finally {
    root.unmount()
    owner.dispose()
  }
}
