import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { createSceneStore } from "@/project/sections/arrangement/core/scene"
import { createTimelineController } from "@/project/sections/arrangement/timeline/controller"
import { englishLabels } from "@/app/locales/sections/timeline"
import { Toolbar } from "@/project/sections/arrangement/timeline/toolbar"

const controller = createTimelineController({
  sceneStore: createSceneStore(DEFAULT_LAYOUT_TOKENS),
  initialSize: { containerWidth: 1280, bodyHeight: 400, timelineLeft: 0 },
  metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
  keyboard: { focus: () => "timeline", blurControl: () => {} },
  subscribeWindowActive: () => () => {},
})
const root = createTestRoot({ width: 1280, height: 40 })
try {
  root.render(
    <ThemeProvider>
      <Toolbar
        pxPerBar={100}
        zoom={controller.view.stepZoom}
        keyboard={controller.keyboard}
        labels={englishLabels}
      />
    </ThemeProvider>
  )
  for (let pass = 0; pass < 3; pass++) {
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
  const toolbar = root.renderer.findByTestId("timeline-toolbar")
  if (!toolbar) throw new Error("Toolbar not mounted")
  const nodes = root.renderer.findByType("div").filter(node => node.parentId === toolbar.id)
  console.log(
    JSON.stringify(
      {
        token: toolbar.style.padding,
        toolbar: root.renderer.getElementBounds(toolbar.id),
        children: nodes.map(node => ({
          id: node.id,
          aria: node.customProps,
          bounds: root.renderer.getElementBounds(node.id),
        })),
        contents: [...root.renderer.findByType("text"), ...root.renderer.findByType("svg")]
          .filter(node => node.testId === undefined || !node.testId.includes("measure"))
          .map(node => ({
            id: node.id,
            parent: node.parentId,
            type: node.type,
            text: node.text,
            bounds: root.renderer.getElementBounds(node.id),
          })),
      },
      null,
      2
    )
  )
} finally {
  root.unmount()
  controller.dispose()
}
