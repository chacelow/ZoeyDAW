import { useMemo, useSyncExternalStore } from "react"
import { i18next, initI18nCore, persistLocale, resolveLocale } from "@zoeymind/i18n/core"
import type { InitI18nOptions, SupportedLocale } from "@zoeymind/i18n/core"
import enUS from "../locales/en-US"
import zhCN from "../locales/zh-CN"

export { SUPPORTED_LOCALES } from "@zoeymind/i18n/core"
export type { SupportedLocale } from "@zoeymind/i18n/core"

/**
 * gpuix binding for the shared i18next singleton. react-i18next resolves a second React
 * (the workspace's react@19.2.8, not the renderer's vendor React), so its hooks cannot run
 * under gpuix; this subscribes to i18next directly instead.
 */
export function initAppI18n(options: InitI18nOptions = {}) {
  return initI18nCore({ "zh-CN": zhCN, "en-US": enUS }, options)
}

function subscribeLanguage(listener: () => void): () => void {
  i18next.on("languageChanged", listener)
  return () => i18next.off("languageChanged", listener)
}

export function useAppTranslation() {
  const locale = resolveLocale(useSyncExternalStore(subscribeLanguage, () => i18next.language))
  const t = useMemo(() => i18next.getFixedT(locale), [locale])
  return { t, locale }
}

/** Switches the interface language and persists it through the storage given to `initAppI18n`. */
export async function changeLocale(locale: SupportedLocale): Promise<void> {
  await i18next.changeLanguage(locale)
  persistLocale(locale)
}
