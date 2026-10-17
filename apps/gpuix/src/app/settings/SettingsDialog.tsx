import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  Separator,
  SettingsShell,
  ToggleGroup,
  ToggleGroupItem,
} from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { openExternalUrl } from "@/platform/external"
import { ModalDialog } from "../dialog/ModalDialog"
import { changeLocale, SUPPORTED_LOCALES, useAppTranslation } from "../i18n"
import { useAppPreferences } from "../preferences"
import { ThemeEditor } from "../theme-editor"
import { isThemeMode, THEME_MODES } from "./theme-mode"
import type { IconName } from "@/ui/controls/Icon"
import type { SettingsNavItem } from "@/ui/controls"
import type { SupportedLocale } from "../i18n"
import type { ThemeMode } from "@/platform/settings"

export type SettingsSection = "appearance" | "language" | "logs" | "about"

const SECTION_ICONS: Record<SettingsSection, IconName> = {
  appearance: "Palette",
  language: "Languages",
  logs: "FileText",
  about: "Info",
}
const MODE_ICONS: Record<ThemeMode, IconName> = { light: "Sun", dark: "Moon", system: "Monitor" }
const GITHUB_URL = "https://github.com"

export interface SettingsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onOpenGallery: () => void
}

export function SettingsDialog({ open, onOpenChange, onOpenGallery }: SettingsDialogProps) {
  const theme = useTheme()
  const { t } = useAppTranslation()
  const [section, setSection] = useState<SettingsSection>("appearance")
  const iconSize = theme.control["--spacing-control-icon"]
  const items: SettingsNavItem[] = (Object.keys(SECTION_ICONS) as SettingsSection[]).map(id => ({
    id,
    label: t(`settings.sections.${id}`),
    icon: <Icon name={SECTION_ICONS[id]} size={iconSize} />,
  }))
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("settings.title")}
      testId="settings-dialog"
    >
      <SettingsShell
        open
        onOpenChange={onOpenChange}
        title={t("settings.title")}
        closeLabel={t("settings.close")}
        navigationLabel={t("settings.navigation")}
        items={items}
        activeId={section}
        onActiveChange={id => setSection(id as SettingsSection)}
        renderPane={id => (
          <SettingsPane section={id as SettingsSection} onOpenGallery={onOpenGallery} />
        )}
      />
    </ModalDialog>
  )
}

function SettingsPane({
  section,
  onOpenGallery,
}: {
  readonly section: SettingsSection
  readonly onOpenGallery: () => void
}) {
  switch (section) {
    case "appearance":
      return <AppearanceSection />
    case "language":
      return <LanguageSection />
    case "logs":
      return <LogsSection />
    case "about":
      return <AboutSection onOpenGallery={onOpenGallery} />
  }
}

function useSectionStyle() {
  const theme = useTheme()
  const gap = theme.design.settings.itemGap
  return {
    section: {
      display: "flex",
      flexDirection: "column",
      gap: theme.design.settings.headerGap,
    } as const,
    field: { display: "flex", flexDirection: "column", gap } as const,
    muted: { color: theme.colors.mutedForeground, whiteSpace: "normal" } as const,
  }
}

function AppearanceSection() {
  const theme = useTheme()
  const { t } = useAppTranslation()
  const {
    themeMode,
    setThemeMode,
    themeModePersisted,
    themeLibrary,
    setThemeLibrary,
    themeLibraryPersisted,
    systemAppearance,
  } = useAppPreferences()
  const styles = useSectionStyle()
  const iconSize = theme.control["--spacing-control-icon"]
  return (
    <div style={styles.section}>
      <div style={styles.field}>
        <Label>{t("settings.themeMode")}</Label>
        <ToggleGroup
          type="single"
          value={themeMode}
          onValueChange={value => {
            if (isThemeMode(value)) setThemeMode(value)
          }}
          aria-label={t("settings.themeMode")}
          style={{
            padding: theme.control["--spacing-control-track-pad"],
            borderRadius: theme.design.shape.controlRadius,
            backgroundColor: theme.colors.muted,
          }}
        >
          {THEME_MODES.map(mode => (
            <ToggleGroupItem
              key={mode}
              value={mode}
              testId={`theme-mode-${mode}`}
              aria-label={t(`ui.theme.${mode}`)}
              disabled={mode === "system" && systemAppearance === null}
              style={{ flexGrow: 1 }}
              onKeyDown={event => {
                if (event.key !== "space" && event.key !== " ") return
                event.preventDefault()
                if (!event.isHeld) setThemeMode(mode)
              }}
            >
              <Icon name={MODE_ICONS[mode]} size={iconSize} />
              <text>{t(`ui.theme.${mode}`)}</text>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {systemAppearance === null ? (
          <text style={styles.muted}>{t("settings.systemUnavailable")}</text>
        ) : null}
        {themeModePersisted && themeLibraryPersisted ? null : (
          <text style={styles.muted}>{t("settings.themeNotPersisted")}</text>
        )}
      </div>
      <Separator />
      <ThemeEditor value={themeLibrary} onChange={setThemeLibrary} t={t} />
    </div>
  )
}

function LanguageSection() {
  const { t, locale } = useAppTranslation()
  const styles = useSectionStyle()
  return (
    <div style={styles.section}>
      <Label>{t("settings.languageDescription")}</Label>
      <RadioGroup
        value={locale}
        onValueChange={value => {
          if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) {
            void changeLocale(value as SupportedLocale)
          }
        }}
        aria-label={t("settings.sections.language")}
      >
        {SUPPORTED_LOCALES.map(code => (
          <RadioGroupItem key={code} value={code} testId={`language-${code}`}>
            {t(`language.${code}`)}
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </div>
  )
}

function LogsSection() {
  const { t } = useAppTranslation()
  const styles = useSectionStyle()
  return (
    <div style={styles.section}>
      <Label>{t("settings.sections.logs")}</Label>
      <text style={styles.muted}>{t("settings.logsPlaceholder")}</text>
    </div>
  )
}

function AboutSection({ onOpenGallery }: { readonly onOpenGallery: () => void }) {
  const theme = useTheme()
  const { t } = useAppTranslation()
  const styles = useSectionStyle()
  const githubLabel = t("about.github")
  return (
    <div style={styles.section}>
      <text style={{ fontWeight: theme.design.typography.weights.semibold }}>{t("app.name")}</text>
      <text style={styles.muted}>{`${t("app.tagline")} · ${t("about.prototype")}`}</text>
      <text style={styles.muted}>{t("about.sourceHint")}</text>
      <Separator />
      <div style={{ display: "flex", flexDirection: "row" }}>
        <Button variant="outline" label={t("titlebar.gallery")} onClick={onOpenGallery}>
          {t("titlebar.gallery")}
        </Button>
        <Button variant="outline" label={githubLabel} onClick={() => openExternalUrl(GITHUB_URL)}>
          {githubLabel}
        </Button>
      </div>
    </div>
  )
}
