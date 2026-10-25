/** Application settings retain their shared shell and independent sections. */
import { useEffect, useState } from "react"
import { Palette, Languages, FileText, Info, AudioLines, Import } from "lucide-react"
import { useTranslation, SUPPORTED_LOCALES, useChangeLocale, useLocale } from "@zoeymind/i18n"
import { Checkbox, Label, RadioGroup, RadioGroupItem, SettingsShell } from "@zoeymind/ui"
import { useSettingsDialog } from "@/shared/app-shared"
import { ThemeModeToggle, ThemePresetGrid } from "@/shared/app-shared/ThemeMenu"
import { getCloseBehavior, setCloseBehavior } from "@/shared/native/close-behavior"
import { isTauri } from "@tauri-apps/api/core"
import { getLogConfig, type LogInfo } from "@/shared/native/log-config"
import type { SettingsNavItem } from "@zoeymind/ui"
import { AudioDeviceSettings } from "./AudioDeviceSettings"
import { PluginSettings } from "./PluginSettings"
import "./settings-layout.css"
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
      <h3 className="settings-section-title">{t("settings.import.title")}</h3>
      <div className="settings-row">
        <Label htmlFor="audio-import-auto-warp">{t("settings.import.autoWarp")}</Label>
        <div className="flex min-w-0 items-center">
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
        </div>
      </div>
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
      <div className="settings-row">
        <Label>{t("ui.theme.mode", "主题")}</Label>
        <div className="min-w-0">
          <ThemeModeToggle />
        </div>
      </div>
      <div className="settings-row">
        <Label>{t("ui.theme.preset", "主题预设")}</Label>
        <div className="min-w-0">
          <ThemePresetGrid />
        </div>
      </div>
      <WindowCloseSettings />
    </section>
  )
}

function WindowCloseSettings() {
  const { t } = useTranslation()
  const [behavior, setBehavior] = useState(getCloseBehavior)
  const [error, setError] = useState(false)
  return (
    <div className="settings-row">
      <Label>{t("settings.window.closeBehavior")}</Label>
      <div className="min-w-0">
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
      </div>
    </div>
  )
}

function LanguageSection() {
  const { t } = useTranslation()
  const current = useLocale()
  const change = useChangeLocale()
  return (
    <section className="settings-row">
      <Label>{t("settings.language", "语言")}</Label>
      <RadioGroup
        className="min-w-0"
        value={current}
        onValueChange={value => change(value as typeof current)}
      >
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
  const available = isTauri()
  const [logInfo, setLogInfo] = useState<LogInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!available) return
    let disposed = false
    void getLogConfig()
      .then(info => {
        if (!disposed) setLogInfo(info)
      })
      .catch(reason => {
        if (!disposed) setError(String(reason))
      })
    return () => {
      disposed = true
    }
  }, [available])

  return (
    <section className="flex flex-col gap-3">
      <div className="settings-row">
        <Label>{t("settings.log.level")}</Label>
        <span className="min-w-0 text-sm">
          {logInfo ? t(`settings.log.levels.${logInfo.level}`) : "—"}
        </span>
      </div>
      <div className="settings-row">
        <Label>{t("settings.log.location")}</Label>
        <span className="min-w-0 text-sm break-all">
          {logInfo?.activeDir ?? (available && !error ? t("common.loading") : "—")}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </section>
  )
}

function AboutSection() {
  const { t } = useTranslation()
  return (
    <section className="settings-row">
      <Label>{t("settings.sections.about", "关于")}</Label>
      <div className="min-w-0 text-sm">
        <span className="font-medium">{t("app.name", "zoeydaw")}</span>
        <span className="text-muted-foreground"> · {t("app.tagline", "Web UI DAW")}</span>
      </div>
    </section>
  )
}
