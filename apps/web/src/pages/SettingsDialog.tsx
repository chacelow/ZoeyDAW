/** Application settings retain their shared shell and independent sections. */
import { useState } from "react"
import { Palette, Languages, FileText, Info, AudioLines, Import } from "lucide-react"
import { useTranslation, SUPPORTED_LOCALES, useChangeLocale, useLocale } from "@zoeymind/i18n"
import { Checkbox, Label, RadioGroup, RadioGroupItem, SettingsShell, Separator } from "@zoeymind/ui"
import { useSettingsDialog } from "@/shared/app-shared"
import { ThemeModeToggle, ThemePresetGrid } from "@/shared/app-shared/ThemeMenu"
import { getCloseBehavior, setCloseBehavior } from "@/shared/native/close-behavior"
import type { SettingsNavItem } from "@zoeymind/ui"
import { AudioDeviceSettings } from "./AudioDeviceSettings"
import { PluginSettings } from "./PluginSettings"
import {
  getAudioImportPreferences,
  setAudioImportPreferences,
} from "@/shared/app-shared/audio-import-preferences"

export function SettingsDialog() {
  const { t } = useTranslation()
  const open = useSettingsDialog(state => state.open)
  const section = useSettingsDialog(state => state.section)
  const setSection = useSettingsDialog(state => state.setSection)
  const closeSettings = useSettingsDialog(state => state.closeSettings)

  const items: SettingsNavItem[] = [
    { id: "preferences", label: t("settings.sections.appearance", "外观"), icon: Palette },
    { id: "editor", label: t("settings.sections.language", "语言"), icon: Languages },
    { id: "agent", label: t("audioSettings.title"), icon: AudioLines },
    { id: "import", label: t("settings.import.title"), icon: Import },
    { id: "plugins", label: t("pluginSettings.title") },
    { id: "ai", label: t("settings.sections.logs", "日志"), icon: FileText },
    { id: "about", label: t("settings.sections.about", "关于"), icon: Info },
  ]

  const activeId = section === "mcp" ? "preferences" : section

  return (
    <SettingsShell
      open={open}
      onOpenChange={next => (next ? setSection(activeId) : closeSettings())}
      title={t("settings.title", "设置")}
      items={items}
      activeId={activeId}
      onActiveChange={id => {
        if (
          id === "preferences" ||
          id === "editor" ||
          id === "ai" ||
          id === "agent" ||
          id === "about" ||
          id === "import" ||
          id === "plugins"
        )
          setSection(id)
      }}
    >
      {activeId === "preferences" && <AppearanceSection />}
      {activeId === "editor" && <LanguageSection />}
      {activeId === "ai" && <LogsSection />}
      {activeId === "agent" && <AudioDeviceSettings />}
      {activeId === "import" && <AudioImportSettings />}
      {activeId === "plugins" && <PluginSettings />}
      {activeId === "about" && <AboutSection />}
    </SettingsShell>
  )
}

function AudioImportSettings() {
  const { t } = useTranslation()
  const [preferences, setPreferences] = useState(getAudioImportPreferences)
  const [error, setError] = useState(false)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="audio-import-auto-warp"
          checked={preferences.autoWarp}
          onCheckedChange={checked => {
            const next = { autoWarp: checked === true }
            const saved = setAudioImportPreferences(next)
            setError(!saved)
            if (saved) setPreferences(next)
          }}
        />
        <Label htmlFor="audio-import-auto-warp">{t("settings.import.autoWarp")}</Label>
      </div>
      <p className="text-muted-foreground text-sm">{t("settings.import.description")}</p>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t("settings.import.preferenceUnavailable")}
        </p>
      )}
    </section>
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
      <Separator />
      <WindowCloseSettings />
    </section>
  )
}

function WindowCloseSettings() {
  const { t } = useTranslation()
  const [behavior, setBehavior] = useState(getCloseBehavior)
  const [error, setError] = useState(false)
  return (
    <section className="flex flex-col gap-2">
      <Label>{t("settings.window.closeBehavior")}</Label>
      <p className="text-muted-foreground text-sm">{t("settings.window.closeBehaviorDesc")}</p>
      <RadioGroup
        value={behavior}
        onValueChange={value => {
          if (value !== "ask" && value !== "tray" && value !== "quit") return
          const saved = setCloseBehavior(value)
          setError(!saved)
          if (saved) setBehavior(value)
        }}
      >
        {(["ask", "tray", "quit"] as const).map(value => (
          <div key={value} className="flex items-center gap-2">
            <RadioGroupItem value={value} id={`close-${value}`} />
            <Label htmlFor={`close-${value}`}>
              {t(
                value === "ask"
                  ? "settings.window.closeAsk"
                  : value === "tray"
                    ? "settings.window.closeTray"
                    : "settings.window.closeQuit"
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t("windowClose.preferenceUnavailable")}
        </p>
      )}
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
