import { THEME_FIELD_LABELS } from "../theme-editor/schema"

export const themeEditorTranslations = {
  en: {
    builtins: "Built-in presets",
    custom: "Your themes",
    new: "New from current",
    newName: "My theme",
    name: "Theme name",
    delete: "Delete",
    export: "Export JSON",
    import: "Import as new theme",
    json: "Theme JSON — paste to import, or copy after export",
    invalidJson: "Invalid theme JSON",
    readonly: "Built-in presets are read-only. Create your own theme to edit every field.",
    fontFamily: "Number font family",
    reset: "Reset",
    resetGroup: "Reset group",
    groups: {
      colors: "Colors",
      shape: "Shape and typography",
      spacing: "Spacing",
      controls: "Control sizes",
      layout: "Layout",
    },
    fields: THEME_FIELD_LABELS.en,
  },
  zh: {
    builtins: "内置预设",
    custom: "你的主题",
    new: "从当前主题新建",
    newName: "我的主题",
    name: "主题名称",
    delete: "删除",
    export: "导出 JSON",
    import: "导入为新主题",
    json: "主题 JSON — 粘贴导入，或导出后复制",
    invalidJson: "主题 JSON 无效",
    readonly: "内置预设为只读。新建自己的主题后即可编辑所有字段。",
    fontFamily: "数字字体族",
    reset: "重置",
    resetGroup: "重置此组",
    groups: {
      colors: "颜色",
      shape: "形状与排版",
      spacing: "间距",
      controls: "控件尺寸",
      layout: "布局",
    },
    fields: THEME_FIELD_LABELS.zh,
  },
}
export function themeEditorTranslation(key: string, locale: "en" | "zh"): string {
  const dictionary = themeEditorTranslations[locale]
  if (key.startsWith("themeEditor.fields."))
    return dictionary.fields[key.slice("themeEditor.fields.".length)] ?? key
  const parts = key.split(".")
  if (parts[1] === "groups")
    return Object.entries(dictionary.groups).find(([group]) => group === parts[2])?.[1] ?? key
  const value = Object.entries(dictionary).find(([name]) => name === parts[1])?.[1]
  return typeof value === "string" ? value : key
}
