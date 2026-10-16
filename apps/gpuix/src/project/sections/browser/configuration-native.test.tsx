import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { hydrateProject } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { BrowserPanel } from "."
import { englishBrowserLabels } from "./demo-labels"

test("browser divider native paint follows editor divider stroke source", () => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  const root = createTestRoot({ width: 600, height: 500 })
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-browser-configuration-"))
  function render(dividerStrokeWidth: number, name: string) {
    root.render(
      <ThemeProvider
        design={{
          ...DEFAULT_DESIGN_TOKENS,
          editor: { ...DEFAULT_DESIGN_TOKENS.editor, dividerStrokeWidth },
        }}
      >
        <BrowserPanel labels={englishBrowserLabels} />
      </ThemeProvider>
    )
    for (let pass = 0; pass < 6; pass++) {
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    const file = path.join(directory, `${name}.png`)
    root.renderer.captureScreenshot(file)
    return readFileSync(file)
  }
  try {
    const initial = render(DEFAULT_DESIGN_TOKENS.editor.dividerStrokeWidth, "before")
    expect(render(3, "changed").equals(initial)).toBe(false)
    expect(
      render(DEFAULT_DESIGN_TOKENS.editor.dividerStrokeWidth, "restored").equals(initial)
    ).toBe(true)
  } finally {
    root.unmount()
    rmSync(directory, { recursive: true, force: true })
  }
})
