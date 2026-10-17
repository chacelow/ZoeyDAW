import { useState } from "react"
import { useAppTranslation } from "@/app/i18n"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Separator } from "@/ui/controls"
import type { DisplayFormats } from "@/project/model/display-formats"
import { GalleryCategories, GalleryCatalog } from "./catalog"

export function GalleryWorkspace({
  locale,
  formats,
}: {
  readonly locale: "en" | "zh"
  readonly formats: DisplayFormats
}) {
  const theme = useTheme()
  const { t } = useAppTranslation()
  const [category, setCategory] = useState("buttons")
  const translate = (en: string, zh: string) => (locale === "zh" ? zh : en)
  return (
    <div
      testId="gallery-root"
      role="application"
      aria-label={t("titlebar.gallery")}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        style={{ display: "flex", flexDirection: "row", flexGrow: 1, minHeight: 0, minWidth: 0 }}
      >
        <div style={{ width: theme.design.settings.navigationWidth, flexShrink: 0, minHeight: 0 }}>
          <GalleryCategories category={category} onCategoryChange={setCategory} t={translate} />
        </div>
        <Separator orientation="vertical" decorative />
        <div style={{ flexGrow: 1, minWidth: 0, minHeight: 0 }}>
          <GalleryCatalog category={category} locale={locale} formats={formats} t={translate} />
        </div>
      </div>
    </div>
  )
}
