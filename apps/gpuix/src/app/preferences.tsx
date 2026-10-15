import { createContext, useContext, useMemo, useSyncExternalStore } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { resolveAppearance } from "./settings/theme-mode"
import type { ReactNode } from "react"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { ThemeMode, ThemeModeStore } from "./settings/theme-mode"

export interface AppPreferences {
  readonly themeMode: ThemeMode
  readonly setThemeMode: (mode: ThemeMode) => void
  readonly themePersisted: boolean
  /** Native system appearance; `null` until the H1 appearance subscription is wired. */
  readonly systemAppearance: Appearance | null
  readonly openSettings: () => void
}

const PreferencesContext = createContext<AppPreferences | null>(null)

export function useAppPreferences(): AppPreferences {
  const preferences = useContext(PreferencesContext)
  if (!preferences) throw new Error("useAppPreferences() called outside <AppPreferencesProvider>")
  return preferences
}

export interface AppPreferencesProviderProps {
  readonly themeModes: ThemeModeStore
  readonly systemAppearance: Appearance | null
  readonly openSettings: () => void
  readonly children: ReactNode
}

/** Resolves the theme mode into the controlled appearance of the single ThemeProvider. */
export function AppPreferencesProvider({
  themeModes,
  systemAppearance,
  openSettings,
  children,
}: AppPreferencesProviderProps) {
  const themeMode = useSyncExternalStore(themeModes.subscribe, themeModes.getMode)
  const themePersisted = useSyncExternalStore(themeModes.subscribe, themeModes.isPersisted)
  const value = useMemo<AppPreferences>(
    () => ({
      themeMode,
      setThemeMode: themeModes.setMode,
      themePersisted,
      systemAppearance,
      openSettings,
    }),
    [themeMode, themeModes, themePersisted, systemAppearance, openSettings]
  )
  return (
    <PreferencesContext.Provider value={value}>
      <ThemeProvider appearance={resolveAppearance(themeMode, systemAppearance)}>
        {children}
      </ThemeProvider>
    </PreferencesContext.Provider>
  )
}
