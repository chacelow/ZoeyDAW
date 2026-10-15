import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

const output = process.env.LANE_CONTENT_CAPTURE_DIR
if (!output)
  throw new Error("LANE_CONTENT_CAPTURE_DIR requires an external pixel evidence directory")
mkdirSync(output, { recursive: true })
const reference = process.env.LANE_CONTENT_REFERENCE
const appearance = process.env.LANE_CONTENT_APPEARANCE === "light" ? "light" : "dark"

Bun.plugin({
  name: "lane-local-content-pixel-oracle",
  setup(build) {
    const clipPath = path.resolve(import.meta.dir, "../ClipCard.tsx")
    const probePath = path.resolve(import.meta.dir, "render-cost.tsx")
    build.onLoad({ filter: /\/(?:ClipCard|render-cost)\.tsx$/ }, async args => {
      if (args.path === clipPath && reference)
        return { contents: readFileSync(reference, "utf8"), loader: "tsx" }
      if (args.path === clipPath)
        return { contents: await Bun.file(args.path).text(), loader: "tsx" }
      if (args.path !== probePath)
        throw new Error(`Unexpected pixel instrumentation path ${args.path}`)
      let contents = await Bun.file(args.path).text()
      const marker = "const { clipIds, ...tree } = countTree(root.renderer.toJSON())"
      if (contents.split(marker).length !== 2)
        throw new Error("Pixel capture instrumentation drift")
      contents =
        'import path from "node:path"\nlet pixelCaptureIndex = 0\n' +
        contents.replace(
          marker,
          () =>
            `root.renderer.captureScreenshot(path.join(${JSON.stringify(output)}, \`frame-\${pixelCaptureIndex++}.png\`))\n    ${marker}`
        )
      const firstInput = '{ kind: "horizontal", deltaX: -480, deltaY: 0 }'
      if (contents.split(firstInput).length !== 2)
        throw new Error("Fractional pixel input instrumentation drift")
      contents = contents.replace(
        firstInput,
        () =>
          '{ kind: "horizontal", deltaX: -7.25, deltaY: 0 },\n    { kind: "horizontal", deltaX: 7.25, deltaY: 0 },\n    ' +
          firstInput
      )
      contents = contents.replaceAll(
        "<ThemeProvider>",
        () => `<ThemeProvider defaultAppearance="${appearance}">`
      )
      return { contents, loader: "tsx" }
    })
  },
})
