import { expect, test } from "bun:test"
import { resolveLocale } from "./core"

test("normalizes language families and falls back for unsupported locales", () => {
  expect(resolveLocale("en-GB")).toBe("en-US")
  expect(resolveLocale("ZH-Hant")).toBe("zh-CN")
  expect(resolveLocale("fr-FR")).toBe("zh-CN")
  expect(resolveLocale(null)).toBe("zh-CN")
})

test("first initialization honors storage and later registration preserves the singleton", () => {
  // A fresh process isolates first initialization from AppShell and other singleton consumers.
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--eval",
      `import { initI18nCore, persistLocale } from "./src/platform/i18n/core";
let saved = "en-US";
const first = initI18nCore(
  { "zh-CN": { probe: "核心" }, "en-US": { probe: "core" } },
  { initialLanguage: "zh-CN", storage: { get: () => saved, set: value => { saved = value } } }
);
const initial = { language: first.language, probe: first.t("probe"), chineseLabel: first.t("language.zh-CN") };
const second = initI18nCore({ "zh-CN": { added: "新增" }, "en-US": { added: "added" } });
const added = second.t("added");
await first.changeLanguage("zh-CN");
persistLocale("zh-CN");
console.log(JSON.stringify({ initial, singleton: first === second, added, saved, language: first.language, probe: first.t("probe") }));`,
    ],
    { cwd: new URL("../../../", import.meta.url).pathname }
  )
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({
    initial: { language: "en-US", probe: "core", chineseLabel: "简体中文" },
    singleton: true,
    added: "added",
    saved: "zh-CN",
    language: "zh-CN",
    probe: "核心",
  })
})
