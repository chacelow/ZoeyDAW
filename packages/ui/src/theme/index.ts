import { BUILTIN_THEME_PRESETS } from "./builtin-presets"
import { THEME_PRESETS as GENERATED_THEME_PRESETS } from "./theme-presets"

export const THEME_PRESETS = [...BUILTIN_THEME_PRESETS, ...GENERATED_THEME_PRESETS]

export { THEME_PRESET_STORAGE_KEY, type ThemePreset, type ThemeStyleProps } from "./theme-presets"
export { MANAGED_KEYS, applyThemePreset, applyThemeOrClear, clearManagedKeys } from "./apply-theme"
export { colorToHsl, colorToHslTuple } from "./color-converter"
export { getShadowMap } from "./shadows"
