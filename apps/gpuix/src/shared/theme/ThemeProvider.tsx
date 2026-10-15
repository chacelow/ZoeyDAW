/**
 * Theme context: the single source every slice reads colors and control
 * metrics from. No feature directory should import `colors.ts` or
 * `@zoeymind/ui/metrics` directly; go through `useTheme()`.
 */
import { createContext, useContext, useMemo, useState } from "react"
import { CONTROL_METRICS, PROJECT_METRICS } from "@zoeymind/ui/metrics"
import { darkColors, lightColors } from "./colors"
import type { ReactNode } from "react"
import type { DerivedThemeColors } from "./colors"

export type Appearance = "light" | "dark"

export interface Theme {
  appearance: Appearance
  colors: DerivedThemeColors
  control: typeof CONTROL_METRICS.default
  transportControl: typeof CONTROL_METRICS.transport
  project: typeof PROJECT_METRICS
}

const ThemeContext = createContext<Theme | null>(null)

function buildTheme(appearance: Appearance): Theme {
  return {
    appearance,
    colors: appearance === "dark" ? darkColors : lightColors,
    control: CONTROL_METRICS.default,
    transportControl: CONTROL_METRICS.transport,
    project: PROJECT_METRICS,
  }
}

export interface ThemeProviderProps {
  children: ReactNode
  /** Initial appearance when uncontrolled; fixed after mount. */
  defaultAppearance?: Appearance
  /** Controlled appearance; changing it re-derives the theme without remounting children. */
  appearance?: Appearance
}

export function ThemeProvider({
  children,
  defaultAppearance = "dark",
  appearance: controlled,
}: ThemeProviderProps) {
  const [initial] = useState<Appearance>(defaultAppearance)
  const appearance = controlled ?? initial
  const theme = useMemo(() => buildTheme(appearance), [appearance])
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext)
  if (!theme) {
    throw new Error("useTheme() called outside <ThemeProvider>")
  }
  return theme
}
