import { expect, test } from "bun:test"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { i18next } from "@/platform/i18n/core"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { initAppI18n } from "../i18n"
import { AppInteractionProvider } from "../interaction"
import { AppPreferencesProvider } from "../preferences"
import { createPreferenceStore } from "./preference-store"
import { SettingsDialog } from "./SettingsDialog"
import { isThemeMode } from "./theme-mode"
import type { ThemeMode } from "@/platform/settings"

test("an open About pane keeps its link caption and accessible name synchronized when locale changes", async () => {
  initAppI18n()
  const previousLanguage = i18next.language
  const labels = [
    { locale: "en-US", label: "GitHub source" },
    { locale: "zh-CN", label: "GitHub 源码" },
  ] as const
  const originalLabels = labels.map(({ locale }) => ({
    locale,
    label: i18next.getFixedT(locale)("about.github"),
  }))
  const stores = {
    themeMode: createPreferenceStore<ThemeMode>(
      { get: () => "dark", set: () => {} },
      isThemeMode,
      "dark"
    ),
    themePreset: createPreferenceStore(
      { get: () => DEFAULT_THEME_PRESET, set: () => {} },
      isThemePresetId,
      DEFAULT_THEME_PRESET
    ),
  }
  const root = createTestRoot({ width: 900, height: 650 })
  try {
    for (const { locale, label } of labels) {
      i18next.addResource(locale, "translation", "about.github", label)
    }
    await i18next.changeLanguage("en-US")
    root.render(
      <AppPreferencesProvider stores={stores} systemAppearance="dark">
        <AppInteractionProvider>
          <SettingsDialog open onOpenChange={() => {}} />
        </AppInteractionProvider>
      </AppPreferencesProvider>
    )
    const about = root.renderer.findByTestId("settings-nav-about")
    if (!about) throw new Error("Missing About navigation")
    root.renderer.nativeSimulateKeystrokes(about.id, "enter")
    for (const { locale, label } of labels) {
      await i18next.changeLanguage(locale)
      flushSync(() => {})
      root.renderer.flush()
      const link = root.renderer
        .findByType("div")
        .find(
          node => node.customProps?.role === "button" && node.customProps?.["aria-label"] === label
        )
      if (!link) throw new Error(`Missing translated About link in ${locale}`)
      expect(root.renderer.getAllText()).toContain(label)
      expect(root.renderer.getElementBounds(link.id)?.width).toBeGreaterThan(0)
      expect(root.renderer.findByTestId("settings-nav-about")?.customProps?.["aria-selected"]).toBe(
        true
      )
    }
  } finally {
    root.unmount()
    for (const { locale, label } of originalLabels) {
      i18next.addResource(locale, "translation", "about.github", label)
    }
    await i18next.changeLanguage(previousLanguage)
  }
})
