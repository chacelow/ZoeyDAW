import { createContext, useContext, useMemo } from "react"
import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { createLayoutTokens } from "./layout-tokens"
import type { LayoutTokens } from "./layout-tokens"
import { derive } from "./colors"
import { DEFAULT_THEME_PRESET, getThemePreset } from "./presets"
import type { ReactNode } from "react"
import type { ColorScheme, DerivedThemeColors } from "./colors"
import type { ThemePresetId } from "./presets"
import { createDesignTokens, DEFAULT_DESIGN_TOKENS } from "./design-tokens"
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
  appearance?: Appearance
  preset?: ThemePresetId
  defaultAppearance?: Appearance
  design?: DesignTokens
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
  const resolvedDesign = useMemo(
    () => design === DEFAULT_DESIGN_TOKENS && control !== CONTROL_METRICS.default
      ? createDesignTokens(control)
      : design,
    [design, control]
  )
  const colors = useMemo(() => {
    if (colorsOverride !== undefined) return colorsOverride
    const selected = getThemePreset(preset)
    return resolvedDesign.colorRecipes === DEFAULT_DESIGN_TOKENS.colorRecipes
      ? selected.colors[scheme]
      : derive(selected.baseColors[scheme], scheme, resolvedDesign.colorRecipes)
  }, [preset, scheme, resolvedDesign.colorRecipes, colorsOverride])
  const theme = useMemo<Theme>(
    () => ({
      appearance: scheme,
      preset,
      colors,
      control,
      transportControl,
      project,
      layout: resolvedLayout,
      design: resolvedDesign,
    }),
    [scheme, preset, resolvedDesign, control, transportControl, project, resolvedLayout, colors]
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
