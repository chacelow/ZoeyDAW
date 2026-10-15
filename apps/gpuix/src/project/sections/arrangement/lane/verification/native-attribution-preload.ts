import path from "node:path"

const mode = process.env.LANE_NATIVE_ATTRIBUTION
if (!["base", "no-text", "merge-divs", "merge-batches"].includes(mode ?? ""))
  throw new Error("LANE_NATIVE_ATTRIBUTION must name one controlled attribution variant")

function replaceOnce(source: string, pattern: string | RegExp, replacement: string): string {
  const matches =
    typeof pattern === "string"
      ? source.split(pattern).length - 1
      : [...source.matchAll(new RegExp(pattern.source, "g"))].length
  if (matches !== 1) throw new Error(`Native attribution source drift: ${pattern}`)
  return source.replace(pattern, () => replacement)
}

Bun.plugin({
  name: "lane-native-cost-attribution",
  setup(build) {
    const contentsPath = path.resolve(import.meta.dir, "../LaneRow/Contents.tsx")
    const cardPath = path.resolve(import.meta.dir, "../ClipContents.tsx")
    build.onLoad({ filter: /\/(?:LaneRow\/Contents|ClipContents)\.tsx$/ }, async args => {
      if (args.path !== contentsPath && args.path !== cardPath) return undefined
      let contents = await Bun.file(args.path).text()
      if (args.path === contentsPath) {
        contents =
          'import { useNativeAttribution } from "../verification/native-attribution"\n' + contents
        contents = replaceOnce(
          contents,
          "  const cards = projectCards(scene, localRow, automationMode)",
          "  const cards = projectCards(scene, localRow, automationMode)\n  const attribution = useNativeAttribution(cards, row.track.color, scene.viewport.width, row.height)"
        )
        contents = replaceOnce(
          contents,
          "        {cards.map(card => (",
          "        {attribution}\n        {cards.map(card => ("
        )
      } else if (mode === "no-text") {
        contents = replaceOnce(contents, /<text\b[\s\S]*?<\/text>/, "")
      } else if (mode === "merge-divs" || mode === "merge-batches") {
        contents = replaceOnce(
          contents,
          /<div\s+style=\{sx\(\{\s*position: "absolute",\s*left: 0,\s*top: 0,\s*width,\s*height: g\.titleHeight,[\s\S]*?\}\)\}\s*\/>/,
          ""
        )
        contents = replaceOnce(
          contents,
          /<div\s+style=\{sx\(\{\s*position: "absolute",\s*left: 0,\s*top: g\.titleHeight,\s*width,\s*height: g\.bodyHeight,[\s\S]*?\}\)\}\s*\/>/,
          ""
        )
        if (mode === "merge-batches")
          contents = replaceOnce(
            contents,
            /\{gridBatch\.hasMajor\s*&&\s*\(?\s*<QuadBatch[\s\S]*?\/>\s*\)?\s*\}/,
            ""
          )
      }
      return { contents, loader: "tsx" }
    })
  },
})
