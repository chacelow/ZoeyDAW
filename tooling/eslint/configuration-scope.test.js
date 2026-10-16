import { describe, it, expect } from "vitest"
import { isProductFile } from "./configuration-scope.js"

describe("configuration product scope", () => {
  it.each([
    "app/Home.tsx",
    "ui/controls/Button/index.tsx",
    "project/sections/arrangement/core/layout.ts",
  ])("includes %s", file => {
    expect(isProductFile(`/repo/apps/gpuix/src/${file}`)).toBe(true)
  })
  it.each([
    "ui/Button.test.tsx",
    "ui/Button.spec.tsx",
    "ui/__tests__/fixture.tsx",
    "ui/test-helper.ts",
    "app/verification/probe.tsx",
    "project/demo.tsx",
    "project/demo/index.tsx",
    "gallery/Gallery.tsx",
    "ui/panels/PanelGallery/index.tsx",
    "app/locales/en-US.ts",
    "shared/theme/design-tokens.ts",
    "shared/theme/metrics/config.ts",
    "project/defaults/editor.ts",
  ])("excludes %s", file => {
    expect(isProductFile(`/repo/apps/gpuix/src/${file}`)).toBe(false)
  })
  it("does not accidentally exempt product files with similar names", () => {
    expect(isProductFile("/repo/apps/gpuix/src/ui/demographic.tsx")).toBe(true)
    expect(isProductFile("/repo/apps/gpuix/src/app/gallery-settings.tsx")).toBe(true)
    expect(isProductFile("/repo/tooling/example.ts")).toBe(false)
    expect(isProductFile("/repo/apps/gpuix/src/shared/theme/ThemeProvider.tsx")).toBe(true)
    expect(isProductFile("/repo/apps/gpuix/src/shared/theme/style.ts")).toBe(true)
    expect(isProductFile("C:\\repo\\apps\\gpuix\\src\\ui\\controls\\Button.tsx")).toBe(true)
    expect(isProductFile("C:\\repo\\apps\\gpuix\\src\\gallery\\Gallery.tsx")).toBe(false)
  })
})
