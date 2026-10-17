import { useMemo, useState } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import { Label, ToggleGroup, ToggleGroupItem } from "@/ui/controls"
import type { CursorLockPort } from "@/ui/controls"
import { createDisplayFormats } from "@/app/i18n/display-formats"
import { EMPTY_THEME_LIBRARY, resolveThemeOverrides } from "@/app/theme-editor"
import { GalleryWorkspace } from "./states"
import { GalleryThemePanel } from "./GalleryThemePanel"
import type { GalleryThemeState } from "./GalleryThemePanel"

export function GalleryDemo({
  cursorLock,
  initialAppearance = "dark",
  initialLocale = "en",
}: {
  readonly cursorLock?: CursorLockPort
  readonly initialAppearance?: Appearance
  readonly initialLocale?: "en" | "zh"
}) {
  const [themeState, setThemeState] = useState<GalleryThemeState>({
    appearance: initialAppearance,
    library: EMPTY_THEME_LIBRARY,
  })
  const { appearance, library } = themeState
  const overrides = useMemo(() => resolveThemeOverrides(library, appearance), [library, appearance])
  const [locale, setLocale] = useState(initialLocale)
  const formats = useMemo(() => createDisplayFormats(locale === "zh" ? "zh-CN" : "en-US"), [locale])
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  return (
    <ThemeProvider {...overrides}>
      <GalleryWorkspace
        cursorLock={cursorLock}
        locale={locale}
        formats={formats}
        themePanel={
          <GalleryThemePanel
            locale={locale}
            value={themeState}
            onChange={setThemeState}
            languageControl={
              <>
                <Label>{t("Language", "语言")}</Label>
                <ToggleGroup
                  type="single"
                  value={locale}
                  aria-label={t("Language", "语言")}
                  onValueChange={next => {
                    if (next === "en" || next === "zh") setLocale(next)
                  }}
                >
                  <ToggleGroupItem value="en" testId="gallery-language-en">
                    English
                  </ToggleGroupItem>
                  <ToggleGroupItem value="zh" testId="gallery-language-zh">
                    中文
                  </ToggleGroupItem>
                </ToggleGroup>
              </>
            }
          />
        }
      />
    </ThemeProvider>
  )
}
