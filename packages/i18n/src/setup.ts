/** i18next 单例。资源增量合并；语言由宿主注入，不读取 DOM。 */

import i18next from "i18next"
import { initReactI18next } from "react-i18next"
import zhCN from "./locales/zh-CN"
import enUS from "./locales/en-US"

export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = "zh-CN"

export interface I18nStorage {
  get(): string | null
  set(locale: SupportedLocale): void
}

let storage: I18nStorage | undefined

export function resolveLocale(locale: string | null | undefined): SupportedLocale {
  if (locale?.toLowerCase().startsWith("en")) return "en-US"
  if (locale?.toLowerCase().startsWith("zh")) return "zh-CN"
  return DEFAULT_LOCALE
}

/**
 * App-level locale bundles — merged on top of the core namespaces at the top level.
 * Top-level keys (e.g. `mindmap`, `qms`) MUST NOT collide with core (`common`, `auth`, ...).
 */
export interface AppLocaleResources {
  "zh-CN": Record<string, unknown>
  "en-US": Record<string, unknown>
}

let isInitialized = false

/**
 * Initialize the i18next singleton; safe to call multiple times.
 * On the first call, options + core resources + optional appResources are bound.
 * Subsequent calls keep the existing instance and merge any new `appResources`
 * via `addResourceBundle` (deep + overwrite) so HMR-rerendered providers stay consistent.
 */
export function initI18n(
  appResources?: AppLocaleResources,
  options?: { storage?: I18nStorage; initialLanguage?: string }
): typeof i18next {
  if (options?.storage) storage = options.storage
  if (isInitialized) {
    if (appResources) {
      registerAppResources(appResources)
    }
    return i18next
  }

  i18next.use(initReactI18next).init({
    lng: resolveLocale(
      storage?.get() ?? options?.initialLanguage ?? Intl.DateTimeFormat().resolvedOptions().locale
    ),
    resources: {
      "zh-CN": { translation: { ...zhCN, ...appResources?.["zh-CN"] } },
      "en-US": { translation: { ...enUS, ...appResources?.["en-US"] } },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    ns: ["translation"],
    defaultNS: "translation",
    react: { useSuspense: false },
    interpolation: { escapeValue: false },
  })

  isInitialized = true
  return i18next
}

export function persistLocale(locale: SupportedLocale): void {
  storage?.set(locale)
}

function registerAppResources(res: AppLocaleResources) {
  // deep=true (merge), overwrite=true (app wins for matching subtrees).
  // Core 与 app 的顶层 namespace 不重叠 (mindmap/qms/kb/projects vs common/auth/...).
  i18next.addResourceBundle("zh-CN", "translation", res["zh-CN"], true, true)
  i18next.addResourceBundle("en-US", "translation", res["en-US"], true, true)
}

export { default as i18next } from "i18next"
