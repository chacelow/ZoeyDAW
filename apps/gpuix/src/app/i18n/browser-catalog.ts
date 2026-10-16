import { browserCatalogByLocale } from "../locales/browser-catalog"
import type { BrowserEntry } from "@/project/sections/browser/catalog"
import type { SupportedLocale } from "@/platform/i18n/core"

export function getBrowserEntries(
  locale: SupportedLocale,
  source = browserCatalogByLocale
): readonly BrowserEntry[] {
  return source[locale]
}
