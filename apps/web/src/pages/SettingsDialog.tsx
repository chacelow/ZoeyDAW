/**
 * SettingsDialog — prototype 阶段精简版。
 *
 * 保留以前的交互形态 (SettingsShell: 左侧导航 + 右侧内容)，
 * 但只装 4 段：外观 / 语言 / 日志 / 关于。
 * AI / MCP / 工程偏好等待 DAW 需求成形后再加。
 */
import { Palette, Languages, FileText, Info } from "lucide-react"
import { useTranslation, SUPPORTED_LOCALES, useChangeLocale, useLocale } from "@zoeymind/i18n"
import { Label, RadioGroup, RadioGroupItem, SettingsShell, Separator } from "@zoeymind/ui"
import { useSettingsDialog } from "@/shared/app-shared"
import { ThemeModeToggle, ThemePresetGrid } from "@/shared/app-shared/ThemeMenu"
import type { SettingsNavItem } from "@zoeymind/ui"
import type { SettingsSectionId } from "@/shared/app-shared"

const SECTION_ORDER = new Set<SettingsSectionId>(["preferences", "editor", "ai", "agent", "about"])

export function SettingsDialog() {
  const { t } = useTranslation()
  const open = useSettingsDialog(state => state.open)
  const section = useSettingsDialog(state => state.section)
  const setSection = useSettingsDialog(state => state.setSection)
  const closeSettings = useSettingsDialog(state => state.closeSettings)

  const items: SettingsNavItem[] = [
    { id: "preferences", label: t("settings.sections.appearance", "外观"), icon: Palette },
    { id: "editor", label: t("settings.sections.language", "语言"), icon: Languages },
    { id: "ai", label: t("settings.sections.logs", "日志"), icon: FileText },
    { id: "about", label: t("settings.sections.about", "关于"), icon: Info },
  ]

  // settings-dialog-store 的 SettingsSectionId 保留了老枚举，这里按位复用避免 store 改动。
  const activeId = SECTION_ORDER.has(section) ? section : "preferences"

  return (
    <SettingsShell
      open={open}
      onOpenChange={next => (next ? setSection(activeId) : closeSettings())}
      title={t("settings.title", "设置")}
      items={items}
      activeId={activeId}
      onActiveChange={id => setSection(id as SettingsSectionId)}
    >
      {activeId === "preferences" && <AppearanceSection />}
      {activeId === "editor" && <LanguageSection />}
      {activeId === "ai" && <LogsSection />}
      {activeId === "about" && <AboutSection />}
    </SettingsShell>
  )
}

function AppearanceSection() {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>{t("ui.theme.mode", "主题")}</Label>
        <ThemeModeToggle />
      </div>
      <Separator />
      <div className="flex flex-col gap-2">
        <Label>{t("ui.theme.preset", "主题预设")}</Label>
        <ThemePresetGrid />
      </div>
    </section>
  )
}

function LanguageSection() {
  const { t } = useTranslation()
  const current = useLocale()
  const change = useChangeLocale()
  return (
    <section className="flex flex-col gap-4">
      <Label>{t("settings.languageDescription", "选择应用界面语言。")}</Label>
      <RadioGroup value={current} onValueChange={value => change(value as typeof current)}>
        {SUPPORTED_LOCALES.map(loc => (
          <div key={loc} className="flex items-center gap-2">
            <RadioGroupItem value={loc} id={`lang-${loc}`} />
            <Label htmlFor={`lang-${loc}`}>{t(`language.${loc}`)}</Label>
          </div>
        ))}
      </RadioGroup>
    </section>
  )
}

function LogsSection() {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-3">
      <Label>{t("settings.sections.logs", "日志")}</Label>
      <p className="text-muted-foreground text-sm">
        {t(
          "settings.logsPlaceholder",
          "日志级别和目录控制将在接入 Rust 日志 command 时填入；原有命令仍在 (`get_log_config` / `set_log_level` / `clear_logs`)。"
        )}
      </p>
    </section>
  )
}

function AboutSection() {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-medium">{t("app.name", "zoeydaw")}</h3>
      <p className="text-muted-foreground text-sm">
        {t("app.tagline", "Web UI DAW")} · {t("about.prototype", "prototype 骨架")}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("about.sourceHint", "音频核心、CLAP + VST3 host、Browser、.als 导入等按界面需求迭代。")}
      </p>
      <div className="pt-2">
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="text-foreground hover:bg-muted inline-flex h-8 items-center rounded-md border px-3 text-xs transition-colors"
        >
          GitHub
        </a>
      </div>
    </section>
  )
}
