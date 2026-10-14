import { describe, expect, test } from "bun:test"
import { initI18n, persistLocale, resolveLocale, type SupportedLocale } from "./setup"

describe("non-DOM i18n initialization", () => {
  test("stored language wins over initial system language and switching persists through injection", async () => {
    let saved: string | null = "en-US"
    const storage = {
      get: () => saved,
      set: (locale: SupportedLocale) => {
        saved = locale
      },
    }
    const i18n = initI18n(undefined, { storage, initialLanguage: "zh-CN" })
    expect(i18n.language).toBe("en-US")
    await i18n.changeLanguage("zh-CN")
    persistLocale("zh-CN")
    expect(saved).toBe("zh-CN")
    expect(i18n.language).toBe("zh-CN")
  })

  test("normalizes known language families and falls back for unsupported locales", () => {
    expect(resolveLocale("en-GB")).toBe("en-US")
    expect(resolveLocale("ZH-Hant")).toBe("zh-CN")
    expect(resolveLocale("fr-FR")).toBe("zh-CN")
  })
})
