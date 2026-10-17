import { createTestRoot } from "@gpuix/react/testing"
import { GalleryDemo } from "./GalleryDemo"
import { GALLERY_CATALOG } from "./catalog"

const viewport = { width: 1045, height: 780 }
const root = createTestRoot(viewport)
try {
  root.render(<GalleryDemo />)
  for (const entry of GALLERY_CATALOG) {
    for (let frame = 0; frame < 4; frame++) {
      await Bun.sleep(35)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    const category = root.renderer.findByTestId(`gallery-category-${entry.id}`)
    const bounds = category && root.renderer.getElementBounds(category.id)
    if (!bounds) throw new Error(`Missing Gallery category: ${entry.id}`)
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    root.renderer.nativeSimulateMouseDown(x, y)
    root.renderer.nativeSimulateMouseUp(x, y)
    for (let frame = 0; frame < 6; frame++) {
      await Bun.sleep(35)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    if (!root.renderer.findByTestId(`gallery-section-${entry.id}`)) {
      throw new Error(`Gallery category did not activate: ${entry.id}`)
    }
    const samples: number[] = []
    for (let frame = 0; frame < 9; frame++) {
      const start = performance.now()
      root.renderer.flush()
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    const flushP50Ms = samples[4]
    if (flushP50Ms === undefined) throw new Error("Missing Gallery performance samples")
    const nodes = ["div", "text", "svg", "input"].reduce(
      (total, type) => total + root.renderer.findByType(type).length,
      0
    )
    process.stdout.write(
      JSON.stringify({
        workspace: "gallery",
        viewport,
        category: entry.id,
        nodes,
        flushP50Ms,
        samples: samples.length,
        limitMs: 8,
      }) + "\n"
    )
    if (flushP50Ms > 8) process.exitCode = 1
  }
} finally {
  root.unmount()
}
