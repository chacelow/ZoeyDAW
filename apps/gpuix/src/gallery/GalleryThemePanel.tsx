import { useTheme } from "@/shared/theme/ThemeProvider"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import type { ReactNode } from "react"
import { useState } from "react"
import { ThemeEditor } from "@/app/theme-editor"
import type { ThemeLibrary } from "@/app/theme-editor"
import { themeEditorTranslation } from "@/app/locales/theme-editor"
import { Label, ScrollArea, ToggleGroup, ToggleGroupItem } from "@/ui/controls"

export interface GalleryThemeState {
  readonly appearance: Appearance
  readonly library: ThemeLibrary
}
export function GalleryThemePanel({
  locale,
  value,
  onChange,
  languageControl,
}: {
  readonly locale: "en" | "zh"
  readonly value: GalleryThemeState
  readonly onChange: (next: GalleryThemeState) => void
  readonly languageControl?: ReactNode
}) {
  const theme = useTheme()
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const gap = theme.design.settings.itemGap
  const [panelWidth, setPanelWidth] = useState(0)
  const inset = theme.design.cards.controls.inset
  return (
    <ScrollArea
      testId="gallery-theme-panel"
      aria-label={t("Theme", "主题")}
      fill
      onLayout={event => {
        if (event.width !== undefined) setPanelWidth(event.width)
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        padding: inset,
        backgroundColor: theme.colors.card,
        color: theme.colors.foreground,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap,
          width: panelWidth === 0 ? "100%" : Math.max(0, panelWidth - inset * 2),
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <Label>{t("Appearance", "外观")}</Label>
        <ToggleGroup
          type="single"
          value={value.appearance}
          aria-label={t("Appearance", "外观")}
          onValueChange={next => {
            if (next === "light" || next === "dark") onChange({ ...value, appearance: next })
          }}
        >
          <ToggleGroupItem value="dark" testId="gallery-theme-dark">
            {t("Dark", "深色")}
          </ToggleGroupItem>
          <ToggleGroupItem value="light" testId="gallery-theme-light">
            {t("Light", "浅色")}
          </ToggleGroupItem>
        </ToggleGroup>
        {languageControl}
        <ThemeEditor
          value={value.library}
          onChange={library => onChange({ ...value, library })}
          t={key => t(themeEditorTranslation(key, "en"), themeEditorTranslation(key, "zh"))}
        />
      </div>
    </ScrollArea>
  )
}
