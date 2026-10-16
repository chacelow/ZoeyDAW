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

for (const initialLanguage of [undefined, "en-GB"]) {
  test(`storage read failure keeps startup usable (${initialLanguage ?? "default"})`, () => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--eval",
        `import { initAppI18n } from "./src/app/i18n";
import { logger } from "./src/platform/log/logger";
const diagnostics = [];
logger.setConfig({ showLogo: false, sinks: [entry => diagnostics.push({ level: entry.level, args: entry.args })] });
const instance = initAppI18n({
  initialLanguage: ${JSON.stringify(initialLanguage)},
  storage: { get: () => { throw new Error("settings unreadable") }, set: () => {} }
});
console.log(JSON.stringify({ language: instance.language, label: instance.t("language.zh-CN"), diagnostics }));`,
      ],
      { cwd: new URL("../../../", import.meta.url).pathname }
    )
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0)
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({
      language: initialLanguage ? "en-US" : "zh-CN",
      label: "简体中文",
      diagnostics: [
        {
          level: "warn",
          args: [
            "[i18n] Could not read locale; using fallback",
            { operation: "read", locale: initialLanguage ? "en-US" : "zh-CN" },
            expect.objectContaining({ name: "Error", message: "settings unreadable" }),
          ],
        },
      ],
    })
  })
}

test("storage write failure preserves selected language without rejecting changeLocale", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--eval",
      `import { initAppI18n, changeLocale } from "./src/app/i18n";
import { persistLocale } from "./src/platform/i18n/core";
import { logger } from "./src/platform/log/logger";
const diagnostics = [];
logger.setConfig({ showLogo: false, sinks: [entry => diagnostics.push({ level: entry.level, args: entry.args })] });
const instance = initAppI18n({ storage: { get: () => "zh-CN", set: () => { throw new Error("settings unwritable") } } });
await changeLocale("en-US");
const awaitedLanguage = instance.language;
persistLocale("en-US");
void changeLocale("zh-CN");
process.once("beforeExit", () => {
  console.log(JSON.stringify({ awaitedLanguage, language: instance.language, label: instance.t("language.zh-CN"), diagnostics }));
});`,
    ],
    { cwd: new URL("../../../", import.meta.url).pathname }
  )
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0)
  expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({
    awaitedLanguage: "en-US",
    language: "zh-CN",
    label: "简体中文",
    diagnostics: ["en-US", "en-US", "zh-CN"].map(locale => ({
      level: "warn",
      args: [
        "[i18n] Could not persist locale; keeping selected language",
        { operation: "write", locale },
        expect.objectContaining({ name: "Error", message: "settings unwritable" }),
      ],
    })),
  })
})
