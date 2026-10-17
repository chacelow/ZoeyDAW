import { createContext, useContext, useMemo, useSyncExternalStore } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { resolveAppearance } from "./settings/theme-mode"
import { resolveThemeOverrides } from "./theme-editor"
import type { ThemeLibrary, ThemeLibraryStore } from "./theme-editor"
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
  readonly themeLibrary: ThemeLibrary
  readonly setThemeLibrary: (library: ThemeLibrary) => void
  readonly themeLibraryPersisted: boolean
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
  readonly themeLibrary: ThemeLibraryStore
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
  const { themeMode: modes, themePreset: presets, themeLibrary: libraryStore } = stores
  const themeLibrary = useSyncExternalStore(libraryStore.subscribe, libraryStore.get)
  const themeLibraryPersisted = useSyncExternalStore(
    libraryStore.subscribe,
    libraryStore.isPersisted
  )
  const setThemeLibrary = useMemo(
    () => (library: ThemeLibrary) => {
      libraryStore.set(library)
      presets.set(resolveThemeOverrides(library, "dark").preset)
    },
    [libraryStore, presets]
  )
  const themeMode = useSyncExternalStore(modes.subscribe, modes.get)
  const themeModePersisted = useSyncExternalStore(modes.subscribe, modes.isPersisted)
  const themePreset = useSyncExternalStore(presets.subscribe, presets.get)
  const appearance = resolveAppearance(themeMode, systemAppearance)
  const overrides = useMemo(
    () => resolveThemeOverrides(themeLibrary, appearance),
    [themeLibrary, appearance]
  )
  const value = useMemo<AppPreferences>(
    () => ({
      themeMode,
      setThemeMode: modes.set,
      themeModePersisted,
      themePreset,
      setThemePreset: preset => setThemeLibrary({ ...themeLibrary, selection: preset }),
      themeLibrary,
      setThemeLibrary,
      themeLibraryPersisted,
      systemAppearance,
    }),
    [
      themeMode,
      modes,
      themeModePersisted,
      themePreset,
      themeLibrary,
      setThemeLibrary,
      themeLibraryPersisted,
      systemAppearance,
    ]
  )
  return (
    <PreferencesContext.Provider value={value}>
      <ThemeProvider {...overrides}>{children}</ThemeProvider>
    </PreferencesContext.Provider>
  )
}
