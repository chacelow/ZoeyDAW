/**
 * Theme context: the single source every slice reads colors and control
 * metrics from. No feature directory should import `colors.ts` or
 * `shared/theme/metrics` directly; go through `useTheme()`.
 *
 * The provider holds no state: the composition root owns appearance and
 * preset (settings, system appearance) and passes them in. Changing either
 * only swaps the context value, so the subtree keeps its component state.
 */
import { createContext, useContext, useMemo } from "react"
import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { createLayoutTokens } from "./layout-tokens"
import type { LayoutTokens } from "./layout-tokens"
import { derive } from "./colors"
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
  layout: LayoutTokens
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
  /** Complete runtime theme-color override, including semantic roles; also accepts native test inputs. */
  colors?: Theme["colors"]
  layout?: LayoutTokens
  control?: Theme["control"]
  transportControl?: Theme["transportControl"]
  project?: Theme["project"]
}

export function ThemeProvider({
  children,
  appearance,
  preset = DEFAULT_THEME_PRESET,
  defaultAppearance = "dark",
  design = DEFAULT_DESIGN_TOKENS,
  colors: colorsOverride,
  control = CONTROL_METRICS.default,
  transportControl = CONTROL_METRICS.transport,
  project = PROJECT_METRICS,
  layout,
}: ThemeProviderProps) {
  const scheme = appearance ?? defaultAppearance
  const resolvedLayout = useMemo(
    () => layout ?? createLayoutTokens(control, project),
    [layout, control, project]
  )
  const colors = useMemo(() => {
    if (colorsOverride !== undefined) return colorsOverride
    const selected = getThemePreset(preset)
    return design.colorRecipes === DEFAULT_DESIGN_TOKENS.colorRecipes
      ? selected.colors[scheme]
      : derive(selected.baseColors[scheme], scheme, design.colorRecipes)
  }, [preset, scheme, design.colorRecipes, colorsOverride])
  const theme = useMemo<Theme>(
    () => ({
      appearance: scheme,
      preset,
      colors,
      control,
      transportControl,
      project,
      layout: resolvedLayout,
      design,
    }),
    [scheme, preset, design, control, transportControl, project, resolvedLayout, colors]
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
