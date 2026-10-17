import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { getThemePreset, DEFAULT_THEME_PRESET } from "@/shared/theme/presets"

export const THEME_GROUPS = ["colors", "shape", "spacing", "controls", "layout"] as const
export type ThemeFieldGroup = (typeof THEME_GROUPS)[number]
export type ThemeField = {
  readonly group: ThemeFieldGroup
  readonly path: string
  readonly labelKey: string
} & (
  | { readonly kind: "color" }
  | {
      readonly kind: "number"
      readonly min: number
      readonly max: number
      readonly step: number
    }
)

function numericFields(value: object, prefix: string, group: ThemeFieldGroup): ThemeField[] {
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
    const path = `${prefix}.${key}`
    if (typeof child === "number") {
      const opacity = /opacity|fraction/i.test(key)
      const weight = prefix.endsWith("weights")
      const font = key.startsWith("--text")
      const height = /height/i.test(key) || key === "--spacing-control-track"
      return [
        {
          group,
          path,
          labelKey: `themeEditor.fields.${path}`,
          kind: "number" as const,
          min: weight
            ? 100
            : font
              ? 6
              : key === "--spacing-control-track" || key === "defaultTrackHeight"
                ? 8
                : 0,
          max: opacity
            ? 1
            : weight
              ? 900
              : Math.max(child * 8, height ? 1200 : /width/i.test(key) ? 1600 : 128),
          step: opacity ? 0.05 : weight ? 100 : 0.5,
        },
      ]
    }
    return child !== null && typeof child === "object" ? numericFields(child, path, group) : []
  })
}

export const THEME_FIELDS: readonly ThemeField[] = [
  ...(["light", "dark"] as const).flatMap(scheme =>
    Object.keys(getThemePreset(DEFAULT_THEME_PRESET).baseColors[scheme]).map(key => ({
      group: "colors" as const,
      path: `colors.${scheme}.${key}`,
      labelKey: `themeEditor.fields.colors.${scheme}.${key}`,
      kind: "color" as const,
    }))
  ),
  ...numericFields(DEFAULT_DESIGN_TOKENS.shape, "design.shape", "shape"),
  ...numericFields(DEFAULT_DESIGN_TOKENS.cards, "design.cards", "shape"),
  ...numericFields(DEFAULT_DESIGN_TOKENS.menu, "design.menu", "shape"),
  ...numericFields(DEFAULT_DESIGN_TOKENS.popover, "design.popover", "shape"),
  ...numericFields(DEFAULT_DESIGN_TOKENS.input, "design.input", "spacing"),
  ...numericFields(DEFAULT_DESIGN_TOKENS.list, "design.list", "spacing"),
  ...numericFields(DEFAULT_DESIGN_TOKENS.spacing, "design.spacing", "spacing"),
  ...numericFields(DEFAULT_DESIGN_TOKENS.typography.weights, "design.typography.weights", "shape"),
  ...numericFields(DEFAULT_DESIGN_TOKENS.states, "design.states", "shape"),
  ...numericFields(CONTROL_METRICS, "control", "controls"),
  ...numericFields(PROJECT_METRICS, "project", "layout"),
  ...Object.entries(DEFAULT_DESIGN_TOKENS).flatMap(([key, value]) => {
    if (
      [
        "shape",
        "cards",
        "menu",
        "popover",
        "input",
        "list",
        "spacing",
        "typography",
        "states",
        "colorRecipes",
        "cursors",
        "motion",
      ].includes(key)
    )
      return []
    const group = ["dock", "settings", "tabs", "dialog"].includes(key) ? "layout" : "controls"
    return numericFields(value, `design.${key}`, group)
  }),
]

const WORDS: Record<string, string> = {
  colors: "颜色",
  light: "浅色",
  dark: "深色",
  design: "设计",
  shape: "形状",
  cards: "卡片",
  default: "默认",
  sm: "小号",
  controls: "控件",
  project: "工程",
  menu: "菜单",
  popover: "浮层",
  spacing: "间距",
  typography: "排版",
  weights: "字重",
  states: "状态",
  control: "控件",
  transport: "走带",
  input: "输入框",
  list: "列表",
  row: "行",
  radius: "圆角",
  inset: "内边距",
  gap: "间距",
  width: "宽度",
  height: "高度",
  border: "边框",
  opacity: "透明度",
  padding: "内边距",
  track: "轨道",
  panel: "面板",
  foreground: "前景",
  background: "背景",
  primary: "主色",
  secondary: "次色",
  accent: "强调",
  muted: "弱化",
  destructive: "危险",
  success: "成功",
  chart: "图表",
  ring: "焦点环",
  medium: "中等",
  semibold: "半粗",
  number: "数字",
}

export function themeFieldLabel(path: string, locale: "en" | "zh"): string {
  return path
    .replaceAll("--", "")
    .split(".")
    .map(part => {
      const words = part
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll("-", " ")
        .split(" ")
      return words
        .map(word => (locale === "zh" ? (WORDS[word.toLowerCase()] ?? word) : word))
        .join(" ")
    })
    .join(" · ")
}

export const THEME_FIELD_LABELS = {
  en: Object.fromEntries(
    THEME_FIELDS.map(field => [field.path, themeFieldLabel(field.path, "en")])
  ),
  zh: Object.fromEntries(
    THEME_FIELDS.map(field => [field.path, themeFieldLabel(field.path, "zh")])
  ),
}
