import { useTheme } from "@/shared/theme/ThemeProvider"
import { ListRow, ScrollArea } from "@/ui/controls"
import { ButtonsSection } from "./buttons"
import { TogglesSection } from "./toggles"
import { NumericSection } from "./numeric"
import { InputsSection } from "./inputs"
import { MenusSection } from "./menus"
import { ListsSection } from "./lists"
import { MetersSection } from "./meters"
import { SurfacesSection } from "./surfaces"
import { LayoutSection } from "./layout"
import { CompositesSection } from "./composites"
import type { GallerySectionProps } from "./GallerySection"
import type { ComponentType } from "react"

interface CatalogEntry {
  readonly id: string
  readonly en: string
  readonly zh: string
  readonly Section: ComponentType<GallerySectionProps>
}

export const GALLERY_CATALOG: readonly CatalogEntry[] = [
  { id: "buttons", en: "Buttons", zh: "按钮", Section: ButtonsSection },
  { id: "toggles", en: "Toggles and choices", zh: "开关与选择", Section: TogglesSection },
  { id: "numeric", en: "Numeric", zh: "数值", Section: NumericSection },
  { id: "inputs", en: "Inputs", zh: "输入", Section: InputsSection },
  { id: "menus", en: "Menus and popups", zh: "菜单与弹层", Section: MenusSection },
  { id: "lists", en: "Lists and navigation", zh: "列表与导航", Section: ListsSection },
  { id: "meters", en: "Meters and feedback", zh: "电平与反馈", Section: MetersSection },
  { id: "surfaces", en: "Surfaces", zh: "容器", Section: SurfacesSection },
  { id: "layout", en: "Layout", zh: "布局", Section: LayoutSection },
  { id: "composites", en: "Composites", zh: "组合", Section: CompositesSection },
]

export function GalleryCategories({
  category,
  onCategoryChange,
  t,
}: {
  readonly category: string
  readonly onCategoryChange: (category: string) => void
  readonly t: GallerySectionProps["t"]
}) {
  const theme = useTheme()
  return (
    <ScrollArea
      testId="gallery-categories"
      aria-label={t("Component categories", "组件类别")}
      fill
      style={{ display: "flex", flexDirection: "column", padding: theme.design.cards.controls.inset }}
    >
      <div
        role="listbox"
        aria-label={t("Component categories", "组件类别")}
        style={{ display: "flex", flexDirection: "column", width: "100%", flexShrink: 0 }}
      >
        {GALLERY_CATALOG.map(entry => (
          <ListRow
            key={entry.id}
            testId={`gallery-category-${entry.id}`}
            role="option"
            label={t(entry.en, entry.zh)}
            selected={entry.id === category}
            onClick={() => onCategoryChange(entry.id)}
            style={{ width: "100%" }}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

export function GalleryCatalog({
  category,
  ...props
}: GallerySectionProps & { readonly category: string }) {
  const theme = useTheme()
  const active = GALLERY_CATALOG.find(entry => entry.id === category) ?? GALLERY_CATALOG[0]
  const ActiveSection = active?.Section
  return (
    <div
      testId="gallery-catalog"
      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}
    >
      <ScrollArea
        key={active?.id}
        testId="gallery-body-scroll"
        aria-label={props.t("Gallery sections", "画廊分区")}
        fill
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          padding: theme.design.cards.controls.inset,
        }}
      >
        {ActiveSection ? <ActiveSection {...props} /> : null}
      </ScrollArea>
    </div>
  )
}
