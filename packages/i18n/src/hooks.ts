/**
 * i18n 便捷 hooks.
 */

import { useTranslation } from "react-i18next"
import { persistLocale, resolveLocale } from "./setup"
import type { SupportedLocale } from "./setup"

/**
 * 拿当前生效语言 (i18n.resolvedLanguage).
 * 总返回 SupportedLocale 之一 (fallback 到 DEFAULT_LOCALE).
 */
export function useLocale(): SupportedLocale {
  const { i18n } = useTranslation()
  return resolveLocale(i18n.resolvedLanguage ?? i18n.language)
}

/** 切换语言并通过宿主注入的 I18nStorage 持久化。 */
export function useChangeLocale(): (locale: SupportedLocale) => Promise<void> {
  const { i18n } = useTranslation()
  return async (locale: SupportedLocale) => {
    await i18n.changeLanguage(locale)
    persistLocale(locale)
  }
}
