export const THEME_PRESET_STORAGE_KEY = "zoey-theme-preset"

export type ThemeStyleProps = Record<string, string>

export interface ThemePreset {
  id: string
  label: string
  styles: { light: ThemeStyleProps; dark: ThemeStyleProps }
  /** Light-mode preview swatches: [background, primary, accent]. */
  preview: [string, string, string]
}
