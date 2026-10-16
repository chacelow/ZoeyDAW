import i18next from "i18next"
import zhCN from "./locales/zh-CN"
import enUS from "./locales/en-US"
import type { Module } from "i18next"
import { logger } from "@/platform/log/logger"

export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = "zh-CN"

export interface I18nStorage {
  get(): string | null
  set(locale: SupportedLocale): void
}

export interface AppLocaleResources {
  "zh-CN": Record<string, unknown>
  "en-US": Record<string, unknown>
}

export interface InitI18nOptions {
  storage?: I18nStorage
  initialLanguage?: string
}

let storage: I18nStorage | undefined
let isInitialized = false

export function resolveLocale(locale: string | null | undefined): SupportedLocale {
  if (locale?.toLowerCase().startsWith("en")) return "en-US"
  if (locale?.toLowerCase().startsWith("zh")) return "zh-CN"
  return DEFAULT_LOCALE
}

export function initI18nCore(
  appResources?: AppLocaleResources,
  options?: InitI18nOptions,
  plugins: readonly Module[] = []
): typeof i18next {
  if (options?.storage) storage = options.storage
  if (isInitialized) {
    if (appResources) {
      registerAppResources(appResources)
    }
    return i18next
  }

  for (const plugin of plugins) i18next.use(plugin)
  let language: string | null | undefined
  try {
    language =
      storage?.get() ?? options?.initialLanguage ?? Intl.DateTimeFormat().resolvedOptions().locale
  } catch (error) {
    language = options?.initialLanguage ?? DEFAULT_LOCALE
    logger.warn(
      "[i18n] Could not read locale; using fallback",
      { operation: "read", locale: resolveLocale(language) },
      error
    )
  }
  i18next.init({
    lng: resolveLocale(language),
    resources: {
      "zh-CN": { translation: { ...zhCN, ...appResources?.["zh-CN"] } },
      "en-US": { translation: { ...enUS, ...appResources?.["en-US"] } },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    ns: ["translation"],
    defaultNS: "translation",
    interpolation: { escapeValue: false },
  })

  isInitialized = true
  return i18next
}

export function persistLocale(locale: SupportedLocale): void {
  try {
    storage?.set(locale)
  } catch (error) {
    logger.warn(
      "[i18n] Could not persist locale; keeping selected language",
      { operation: "write", locale },
      error
    )
  }
}

function registerAppResources(res: AppLocaleResources) {
  i18next.addResourceBundle("zh-CN", "translation", res["zh-CN"], true, true)
  i18next.addResourceBundle("en-US", "translation", res["en-US"], true, true)
}

export { default as i18next } from "i18next"
