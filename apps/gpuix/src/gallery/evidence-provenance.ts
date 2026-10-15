import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyEvidenceBinding } from "./evidence-binding"

export function captureEvidenceProvenance(repository: string) {
  const hash = (filename: string) =>
    createHash("sha256").update(readFileSync(filename)).digest("hex")
  const vendor = realpathSync(path.resolve(repository, ".gpuix-main"))
  const config: { revision: string; zedRevision: string; patches: string[] } = JSON.parse(
    readFileSync(path.resolve(repository, "scripts/gpuix-main/config.json"), "utf8")
  )
  return {
    capturedUtc: new Date().toISOString(),
    repositoryHead: execFileSync("/usr/bin/git", ["-C", repository, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trimEnd(),
    repositoryDiffSha256: createHash("sha256")
      .update(execFileSync("/usr/bin/git", ["-C", repository, "diff", "--binary", "HEAD"]))
      .digest("hex"),
    sourceFiles: Object.fromEntries(
      [
        ...[
          "states.tsx",
          "controls.tsx",
          "GalleryDemo.tsx",
          "GalleryCard.tsx",
          "GalleryMenus.tsx",
          "GalleryExamples.tsx",
          "design-preview.ts",
          "verification/evidence.tsx",
          "evidence-binding.ts",
          "evidence-provenance.ts",
        ].map(name => `apps/gpuix/src/gallery/${name}`),
        "apps/gpuix/src/shared/theme/ThemeProvider.tsx",
        "apps/gpuix/src/shared/theme/design-tokens.ts",
        "apps/gpuix/src/ui/controls/chrome.ts",
        "apps/gpuix/src/ui/controls/Card/index.tsx",
        "apps/gpuix/src/ui/controls/ControlGroup/index.tsx",
        "apps/gpuix/src/ui/controls/Input/index.tsx",
        "apps/gpuix/src/ui/controls/DragPad/DragPadNumber.tsx",
        "apps/gpuix/src/ui/controls/DropdownButton/index.tsx",
        "apps/gpuix/src/ui/controls/ListRow/index.tsx",
        "apps/gpuix/src/ui/controls/ScrollArea/index.tsx",
        "apps/gpuix/src/ui/controls/ScrollArea/ControlledScrollbar.tsx",
        "apps/gpuix/src/ui/controls/Button/index.tsx",
        "apps/gpuix/src/ui/controls/ToggleGroup/index.tsx",
        "apps/gpuix/src/ui/controls/MotionTabs/index.tsx",
        "apps/gpuix/src/ui/controls/SettingsShell/index.tsx",
        "apps/gpuix/src/ui/controls/Menu/index.tsx",
        "apps/gpuix/src/ui/controls/Menu/content.tsx",
        "apps/gpuix/src/ui/controls/Menu/trigger.tsx",
        "apps/gpuix/src/ui/controls/Popover/index.tsx",
        "apps/gpuix/src/ui/panels/PanelShell/index.tsx",
      ].map(name => [name, hash(path.resolve(repository, name))])
    ),
    rendererSourceRevision: config.revision,
    zedRevision: config.zedRevision,
    rendererNative: verifyEvidenceBinding(),
    nativeLoaderResolved: realpathSync(fileURLToPath(import.meta.resolve("@gpuix/native"))),
    runtime: Object.fromEntries(
      [
        "packages/react/dist/index.js",
        "packages/react/dist/testing.js",
        "packages/native/dist/host.js",
        "packages/native/dist/testing.js",
      ].map(name => [name, hash(path.resolve(vendor, name))])
    ),
    patches: config.patches.map(name => ({
      name,
      sha256: hash(path.resolve(repository, "scripts/gpuix-main/patches", name)),
    })),
    layer:
      "native offscreen GPU composition; no host window or OS input; cursorLock capability not injected",
    limits: [
      "Overview and geometry/state checks do not replace coordinator review in the real composition Gallery",
      "Physical held mouse and system cursor anchoring are not proved by headless rendering",
    ],
  }
}
