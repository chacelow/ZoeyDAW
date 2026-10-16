/**
 * Theme color presets: the Web preset list (Default + tweakcn) with each
 * scheme's colors fully derived once at module load, so switching preset or
 * appearance is a lookup, not a recomputation.
 */
import { derive } from "./colors"
import { PRESET_DATA } from "./presets.data"
import type { ColorScheme, DerivedThemeColors, ThemeColors } from "./colors"

export type ThemePresetId = (typeof PRESET_DATA)[number]["id"]

export interface ThemePreset {
  id: ThemePresetId
  label: string
  baseColors: Readonly<Record<ColorScheme, ThemeColors>>
  colors: Readonly<Record<ColorScheme, DerivedThemeColors>>
}

export const DEFAULT_THEME_PRESET: ThemePresetId = "default"

/** Every preset in Web menu order; Default first. */
export const THEME_PRESETS: readonly ThemePreset[] = PRESET_DATA.map(preset => ({
  id: preset.id,
  label: preset.label,
  baseColors: { light: preset.light, dark: preset.dark },
  colors: { light: derive(preset.light, "light"), dark: derive(preset.dark, "dark") },
}))

const PRESETS_BY_ID = new Map<string, ThemePreset>(THEME_PRESETS.map(preset => [preset.id, preset]))

/** Boundary check for ids read from settings or other untyped input. */
export function isThemePresetId(value: string): value is ThemePresetId {
  return PRESETS_BY_ID.has(value)
}

export function getThemePreset(id: ThemePresetId): ThemePreset {
  const preset = PRESETS_BY_ID.get(id)
  if (!preset) throw new RangeError(`Unknown theme preset "${id}"`)
  return preset
}
