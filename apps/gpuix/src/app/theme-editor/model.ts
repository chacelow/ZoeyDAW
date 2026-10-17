import { parse as parseColor } from "culori"
import { logger } from "@/platform/log/logger"
import { derive } from "@/shared/theme/colors"
import type { ThemeColors, ColorScheme } from "@/shared/theme/colors"
import { createDesignTokens } from "@/shared/theme/design-tokens"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"
import type { ControlMetrics, ProjectMetrics } from "@/shared/theme/metrics/config"
import { DEFAULT_THEME_PRESET, getThemePreset, isThemePresetId } from "@/shared/theme/presets"
import type { ThemePresetId } from "@/shared/theme/presets"
import { THEME_FIELDS } from "./schema"
import type { ThemeField, ThemeFieldGroup } from "./schema"

export type DeepPartial<T> = {
  -readonly [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}
type EditableDesign = Omit<DesignTokens, "colorRecipes" | "cursors" | "motion">
export interface CustomTheme {
  readonly id: `custom:${string}`
  readonly name: string
  readonly basePreset: ThemePresetId
  readonly colors: { readonly light: Partial<ThemeColors>; readonly dark: Partial<ThemeColors> }
  readonly design: DeepPartial<EditableDesign>
  readonly control: {
    readonly default: Partial<ControlMetrics>
    readonly transport: Partial<ControlMetrics>
  }
  readonly project: Partial<ProjectMetrics>
}
export type ThemeSelection = ThemePresetId | CustomTheme["id"]
export interface ThemeLibrary {
  readonly selection: ThemeSelection
  readonly themes: readonly CustomTheme[]
}
export const EMPTY_THEME_LIBRARY: ThemeLibrary = { selection: DEFAULT_THEME_PRESET, themes: [] }
export function activeCustomTheme(library: ThemeLibrary): CustomTheme | undefined {
  return library.themes.find(theme => theme.id === library.selection)
}
export function resolveThemeOverrides(library: ThemeLibrary, appearance: ColorScheme) {
  const custom = activeCustomTheme(library)
  const preset =
    custom?.basePreset ??
    (isThemePresetId(library.selection) ? library.selection : DEFAULT_THEME_PRESET)
  const control = { ...CONTROL_METRICS.default, ...custom?.control.default }
  const design = mergeTheme<DesignTokens>(createDesignTokens(control), custom?.design ?? {})
  return {
    appearance,
    preset,
    design,
    colors: derive(
      { ...getThemePreset(preset).baseColors[appearance], ...custom?.colors[appearance] },
      appearance,
      design.colorRecipes
    ),
    control,
    transportControl: { ...CONTROL_METRICS.transport, ...custom?.control.transport },
    project: { ...PROJECT_METRICS, ...custom?.project },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
export function readThemeField(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((item, key) => (isObject(item) ? item[key] : undefined), value)
}
function writePath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".")
  const last = parts.pop()
  let parent = target
  for (const key of parts) {
    const child = parent[key]
    if (isObject(child)) parent = child
    else {
      const next: Record<string, unknown> = {}
      parent[key] = next
      parent = next
    }
  }
  if (last !== undefined) {
    if (value === undefined) delete parent[last]
    else parent[last] = value
  }
}
export function isValidThemeField(field: ThemeField, value: unknown): value is string | number {
  if (field.kind === "color") return typeof value === "string" && parseColor(value) !== undefined
  return (
    typeof value === "number" && Number.isFinite(value) && value >= field.min && value <= field.max
  )
}

export function parseCustomTheme(input: unknown): CustomTheme | null {
  if (
    !isObject(input) ||
    typeof input.id !== "string" ||
    !input.id.startsWith("custom:") ||
    input.id.length <= 7 ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    typeof input.basePreset !== "string" ||
    !isThemePresetId(input.basePreset)
  ) {
    logger.warn("[theme-editor] Dropped invalid custom theme", input)
    return null
  }
  const parsed: CustomTheme & Record<string, unknown> = {
    id: `custom:${input.id.slice("custom:".length)}`,
    name: input.name.trim(),
    basePreset: input.basePreset,
    colors: { light: {}, dark: {} },
    design: {},
    control: { default: {}, transport: {} },
    project: {},
  }
  for (const field of THEME_FIELDS) {
    const value = readThemeField(input, field.path)
    if (value === undefined) continue
    if (isValidThemeField(field, value)) writePath(parsed, field.path, value)
    else logger.warn("[theme-editor] Dropped invalid theme field", input.id, field.path, value)
  }
  const font = readThemeField(input, "design.typography.numberFontFamily")
  if (font !== undefined) {
    if (typeof font === "string" && font.trim() && font.length <= 128)
      writePath(parsed, "design.typography.numberFontFamily", font.trim())
    else logger.warn("[theme-editor] Dropped invalid font family", input.id, font)
  }
  return parsed
}
export function parseThemeLibrary(
  json: string | null,
  fallback: ThemePresetId = DEFAULT_THEME_PRESET
): ThemeLibrary {
  if (json === null) return { selection: fallback, themes: [] }
  try {
    const input: unknown = JSON.parse(json)
    if (!isObject(input) || !Array.isArray(input.themes)) throw new Error("Invalid theme library")
    const themes: CustomTheme[] = []
    for (const entry of input.themes) {
      const theme = parseCustomTheme(entry)
      if (theme && !themes.some(item => item.id === theme.id)) themes.push(theme)
    }
    const selection = input.selection
    return {
      themes,
      selection:
        typeof selection === "string" && isThemePresetId(selection)
          ? selection
          : (themes.find(theme => theme.id === selection)?.id ?? fallback),
    }
  } catch (error) {
    logger.warn("[theme-editor] Could not read theme library", error)
    return { selection: fallback, themes: [] }
  }
}
export function importCustomTheme(json: string): CustomTheme | null {
  try {
    return parseCustomTheme(JSON.parse(json))
  } catch (error) {
    logger.warn("[theme-editor] Invalid theme JSON", error)
    return null
  }
}
export function duplicateCurrentTheme(library: ThemeLibrary, name: string): ThemeLibrary {
  const source = activeCustomTheme(library)
  const theme: CustomTheme = {
    id: `custom:${crypto.randomUUID()}`,
    name,
    basePreset:
      source?.basePreset ??
      (isThemePresetId(library.selection) ? library.selection : DEFAULT_THEME_PRESET),
    colors: source?.colors ?? { light: {}, dark: {} },
    design: source?.design ?? {},
    control: source?.control ?? { default: {}, transport: {} },
    project: source?.project ?? {},
  }
  return { selection: theme.id, themes: [...library.themes, theme] }
}
export function updateCustomTheme(library: ThemeLibrary, theme: CustomTheme): ThemeLibrary {
  return { ...library, themes: library.themes.map(item => (item.id === theme.id ? theme : item)) }
}
export function setThemeField(
  theme: CustomTheme,
  path: string,
  value: string | number | undefined
): CustomTheme {
  const next: Record<string, unknown> = { ...structuredClone(theme) }
  writePath(next, path, value)
  return parseCustomTheme(next) ?? theme
}
export function resetThemeGroup(theme: CustomTheme, group: ThemeFieldGroup): CustomTheme {
  const next: Record<string, unknown> = { ...structuredClone(theme) }
  for (const field of THEME_FIELDS)
    if (field.group === group) writePath(next, field.path, undefined)
  if (group === "shape") writePath(next, "design.typography.numberFontFamily", undefined)
  return parseCustomTheme(next) ?? theme
}
export function deleteCustomTheme(library: ThemeLibrary, id: CustomTheme["id"]): ThemeLibrary {
  const deleted = library.themes.find(theme => theme.id === id)
  return {
    selection:
      library.selection === id ? (deleted?.basePreset ?? DEFAULT_THEME_PRESET) : library.selection,
    themes: library.themes.filter(theme => theme.id !== id),
  }
}
export function mergeTheme<T extends object>(base: T, overrides: DeepPartial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const value = overrides[key]
    const original = base[key]
    if (value !== undefined)
      result[key] = (
        isObject(original) && isObject(value)
          ? mergeTheme<Record<string, unknown>>(original, value)
          : value
      ) as T[keyof T]
  }
  return result
}
