import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { createDisplayFormats } from "@/app/i18n"
import { ButtonsSection } from "./buttons"
import { TogglesSection } from "./toggles"
import { NumericSection } from "./numeric"
import { ListsSection } from "./lists"
import { SurfacesSection } from "./surfaces"
import { CompositesSection } from "./composites"

const sections = {
  buttons: ButtonsSection,
  toggles: TogglesSection,
  numeric: NumericSection,
  lists: ListsSection,
  surfaces: SurfacesSection,
  composites: CompositesSection,
}
const formats = createDisplayFormats("en-US")

for (const [name, Section] of Object.entries(sections)) {
  const root = createTestRoot({ width: 1400, height: 1600 })
  try {
    root.render(
      <ThemeProvider>
        <Section locale="en" formats={formats} t={en => en} />
      </ThemeProvider>
    )
    for (let frame = 0; frame < 6; frame++) {
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    const samples = []
    for (let frame = 0; frame < 9; frame++) {
      const start = performance.now()
      root.renderer.flush()
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    const nodes = ["div", "text", "svg", "input"].reduce(
      (total, type) => total + root.renderer.findByType(type).length,
      0
    )
    process.stdout.write(
      JSON.stringify({ section: name, nodes, flushP50Ms: samples[4], samples: 9 }) + "\n"
    )
  } finally {
    root.unmount()
  }
}
