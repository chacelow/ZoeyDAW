/**
 * Theme context: the single source every slice reads colors and control
 * metrics from. No feature directory should import `colors.ts` or
 * `@zoeymind/ui/metrics` directly; go through `useTheme()`.
 *
 * The provider holds no state: the composition root owns appearance and
 * preset (settings, system appearance) and passes them in. Changing either
 * only swaps the context value, so the subtree keeps its component state.
 */
import { createContext, useContext, useMemo } from "react"
import { CONTROL_METRICS, PROJECT_METRICS } from "@zoeymind/ui/metrics"
import { DEFAULT_THEME_PRESET, getThemePreset } from "./presets"
import type { ReactNode } from "react"
import type { ColorScheme, DerivedThemeColors } from "./colors"
import type { ThemePresetId } from "./presets"
import { DEFAULT_DESIGN_TOKENS } from "./design-tokens"
import type { DesignTokens } from "./design-tokens"

export type Appearance = ColorScheme

export interface Theme {
  appearance: Appearance
  preset: ThemePresetId
  colors: DerivedThemeColors
  control: typeof CONTROL_METRICS.default
  transportControl: typeof CONTROL_METRICS.transport
  project: typeof PROJECT_METRICS
  design: DesignTokens
}

const ThemeContext = createContext<Theme | null>(null)

export interface ThemeProviderProps {
  children: ReactNode
  /** Controlled appearance; falls back to `defaultAppearance` when omitted. */
  appearance?: Appearance
  /** Controlled color preset; Default when omitted. */
  preset?: ThemePresetId
  /** Appearance for demos and tests that do not control it. */
  defaultAppearance?: Appearance
  design?: DesignTokens
}

export function ThemeProvider({
  children,
  appearance,
  preset = DEFAULT_THEME_PRESET,
  defaultAppearance = "dark",
  design = DEFAULT_DESIGN_TOKENS,
}: ThemeProviderProps) {
  const scheme = appearance ?? defaultAppearance
  const theme = useMemo<Theme>(
    () => ({
      appearance: scheme,
      preset,
      colors: getThemePreset(preset).colors[scheme],
      control: CONTROL_METRICS.default,
      transportControl: CONTROL_METRICS.transport,
      project: PROJECT_METRICS,
      design,
    }),
    [scheme, preset, design]
  )
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext)
  if (!theme) {
    throw new Error("useTheme() called outside <ThemeProvider>")
  }
  return theme
}
