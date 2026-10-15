import { expect, test } from "bun:test"
import { initI18nCore } from "./core"

test("core entry initializes i18next without loading react-i18next", () => {
  const i18n = initI18nCore(
    { "zh-CN": { probe: "核心" }, "en-US": { probe: "core" } },
    { initialLanguage: "en-GB" }
  )
  expect(i18n.t("probe")).toBe("core")
  expect(i18n.t("language.zh-CN")).toBe("简体中文")
  const loaded = Object.keys(require.cache).filter(path => path.includes("react-i18next"))
  expect(loaded).toEqual([])
})
