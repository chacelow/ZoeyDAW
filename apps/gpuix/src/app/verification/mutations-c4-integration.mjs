import { verifyConfigurationMutations } from "./configuration-mutation-runner.mjs"

verifyConfigurationMutations({
  testFiles: ["src/project/sections/browser/useBrowser.test.tsx"],
  cases: [
    {
      name: "merged locale search drops compatibility normalization",
      file: "app/i18n/display-formats.ts",
      from: 'text.normalize("NFKC")',
      to: "text",
      pattern:
        "application locale changes display and search without changing selection or favorites",
    },
  ],
})
