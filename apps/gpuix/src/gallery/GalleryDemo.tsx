import { useState } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import type { Appearance } from "@/shared/theme/ThemeProvider"
import { Button, ControlGroup } from "@/ui/controls"
import type { CursorLockPort } from "@/ui/controls"
import { GALLERY_DESIGNS } from "./design-preview"
import type { GalleryDesignMode } from "./design-preview"
import { StateGallery } from "./states"

export function GalleryDemo({
  cursorLock,
  initialAppearance = "dark",
  initialLocale = "en",
  initialDesign = "default",
}: {
  readonly cursorLock?: CursorLockPort
  readonly initialAppearance?: Appearance
  readonly initialLocale?: "en" | "zh"
  readonly initialDesign?: GalleryDesignMode
}) {
  const [appearance, setAppearance] = useState(initialAppearance)
  const [locale, setLocale] = useState(initialLocale)
  const [design, setDesign] = useState(initialDesign)
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en)
  const labels: Record<GalleryDesignMode, string> = {
    default: t("Default design", "默认设计"),
    flat: t("Flat · zero shell radius/border", "直角 · 零外壳圆角与边框"),
    spacious: t("Larger spacing and padding", "加大间距与内边距"),
  }
  const modes: readonly GalleryDesignMode[] = ["default", "flat", "spacious"]
  return (
    <ThemeProvider appearance={appearance} design={GALLERY_DESIGNS[design]}>
      <StateGallery
        cursorLock={cursorLock}
        locale={locale}
        toolbar={
          <ControlGroup
            variant="toolbar"
            testId="gallery-design-toolbar"
            label={t("Read-only design previews", "只读设计演示")}
          >
            {modes.map(mode => (
              <Button
                key={mode}
                testId={`gallery-design-${mode}`}
                active={design === mode}
                onActiveChange={() => setDesign(mode)}
              >
                {labels[mode]}
              </Button>
            ))}
            <Button
              testId="gallery-toggle-appearance"
              onClick={() => setAppearance(value => (value === "dark" ? "light" : "dark"))}
            >
              {appearance === "dark" ? t("Dark", "深色") : t("Light", "浅色")}
            </Button>
            <Button
              testId="gallery-toggle-locale"
              onClick={() => setLocale(value => (value === "en" ? "zh" : "en"))}
            >
              {locale === "en" ? "English" : "中文"}
            </Button>
          </ControlGroup>
        }
      />
    </ThemeProvider>
  )
}
