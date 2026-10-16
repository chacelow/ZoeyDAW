import { createContext, useContext, useMemo, useSyncExternalStore } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { resolveAppearance } from "./settings/theme-mode"
import type { ReactNode } from "react"
import type { ThemePresetId } from "@/shared/theme/presets"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { PreferenceStore } from "./settings/preference-store"
import type { ThemeMode } from "@/platform/settings"

export interface AppPreferences {
  readonly themeMode: ThemeMode
  readonly setThemeMode: (mode: ThemeMode) => void
  readonly themeModePersisted: boolean
  readonly themePreset: ThemePresetId
  readonly setThemePreset: (preset: ThemePresetId) => void
  readonly systemAppearance: Appearance | null
}

const PreferencesContext = createContext<AppPreferences | null>(null)

export function useAppPreferences(): AppPreferences {
  const preferences = useContext(PreferencesContext)
  if (!preferences) throw new Error("useAppPreferences() called outside <AppPreferencesProvider>")
  return preferences
}

export interface AppearanceStores {
  readonly themeMode: PreferenceStore<ThemeMode>
  readonly themePreset: PreferenceStore<ThemePresetId>
}

export interface AppPreferencesProviderProps {
  readonly stores: AppearanceStores
  readonly systemAppearance: Appearance | null
  readonly children: ReactNode
}

export function AppPreferencesProvider({
  stores,
  systemAppearance,
  children,
}: AppPreferencesProviderProps) {
  const { themeMode: modes, themePreset: presets } = stores
  const themeMode = useSyncExternalStore(modes.subscribe, modes.get)
  const themeModePersisted = useSyncExternalStore(modes.subscribe, modes.isPersisted)
  const themePreset = useSyncExternalStore(presets.subscribe, presets.get)
  const value = useMemo<AppPreferences>(
    () => ({
      themeMode,
      setThemeMode: modes.set,
      themeModePersisted,
      themePreset,
      setThemePreset: presets.set,
      systemAppearance,
    }),
    [themeMode, modes, themeModePersisted, themePreset, presets, systemAppearance]
  )
  return (
    <PreferencesContext.Provider value={value}>
      <ThemeProvider
        appearance={resolveAppearance(themeMode, systemAppearance)}
        preset={themePreset}
      >
        {children}
      </ThemeProvider>
    </PreferencesContext.Provider>
  )
}
