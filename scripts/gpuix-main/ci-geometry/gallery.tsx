import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { createDisplayFormats } from "@/app/i18n/display-formats"
import { GalleryWorkspace } from "@/gallery/states"
const output = process.argv[2]
if (!output) throw new Error("Pass an external Gallery evidence directory")
mkdirSync(output, { recursive: true })
const root = createTestRoot({ width: 1050, height: 780 })
const formats = createDisplayFormats("en-US")
try {
  for (const locale of ["en", "zh"] as const) {
    for (const appearance of ["dark", "light"] as const) {
      const key = `${locale}-${appearance}`
      root.render(
        <ThemeProvider appearance={appearance}>
          <GalleryWorkspace locale="en" formats={formats} />
        </ThemeProvider>
      )
      for (let pass = 0; pass < 3; pass++) {
        root.renderer.flush()
        root.renderer.dispatchNativeEvents()
      }
      root.renderer.captureScreenshot(path.join(output, `${key}.png`))
      writeFileSync(
        path.join(output, `${key}.json`),
        JSON.stringify(
          { a11y: root.renderer.getA11yTree(), stats: root.renderer.getDebugFrameOverlayStats() },
          null,
          2
        )
      )
      console.log(`Captured Gallery ${key}`)
    }
  }
} finally {
  root.unmount()
}
if (root.renderer.getRetainedElementCount() !== 0)
  throw new Error("Gallery evidence leaked native nodes")
