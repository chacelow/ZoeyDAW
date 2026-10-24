import type { ComponentType } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { useTheme } from "@zoeymind/ui"
import { useThemePreset } from "@/shared/app-shared"
import type { GalleryFamily } from "./catalog"
import { CompositionDemos } from "./composition-demos"
import { ControlDemos } from "./control-demos"
import { FeedbackDemos } from "./feedback-demos"
import { FormDemos } from "./form-demos"
import { GallerySectionsContext } from "./gallery-section"
import { InteractionDemos } from "./interaction-demos"
import { KnobDemos } from "./knob-demos"
import { MenuDemos } from "./menu-demos"
import { MeterDemos } from "./meter-demos"
import { CommandDemos, FaderDemos, LayoutDemos, PanDemos } from "./specialized-demos"

const DEMOS = {
  controls: ControlDemos,
  forms: FormDemos,
  menus: MenuDemos,
  interaction: InteractionDemos,
  feedback: FeedbackDemos,
  composition: CompositionDemos,
  pan: PanDemos,
  faders: FaderDemos,
  command: CommandDemos,
  layout: LayoutDemos,
  knobs: KnobDemos,
  meters: MeterDemos,
} satisfies Record<Exclude<GalleryFamily["source"], "preview">, ComponentType>

export function FamilyDemo({ family }: { readonly family: GalleryFamily }) {
  const { t, i18n } = useTranslation()
  const { theme } = useTheme()
  const { presetId } = useThemePreset()
  const preferences = new URLSearchParams({
    locale: i18n.resolvedLanguage ?? i18n.language,
    mode: theme,
    preset: presetId,
  }).toString()
  if (family.source === "preview" && family.preview)
    return (
      <div className="min-w-0">
        <iframe
          key={`${family.preview}:${preferences}`}
          title={t(`library.catalog.families.${family.id}.title`)}
          src={`/library/preview/${family.preview}?${preferences}`}
          className="border-border/60 h-[min(78vh,960px)] min-h-[640px] w-full rounded-sm border"
          data-gallery-preview={family.preview}
        />
        <p className="text-muted-foreground mt-1 text-[10px]">
          {t("library.catalog.localPreview")}
        </p>
      </div>
    )
  if (family.source === "preview") return null
  const Demo = DEMOS[family.source]
  return (
    <GallerySectionsContext value={family.sections.length ? family.sections : null}>
      <Demo />
    </GallerySectionsContext>
  )
}
