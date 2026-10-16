import path from "node:path"

export const minimapMutation = {
  id: "ARR-07-static-playback-invalidation",
  file: "project/sections/arrangement/timeline/minimap/Overview.tsx",
  testFile: "src/project/sections/arrangement/timeline/minimap/render-cost.test.tsx",
  testName: "playback moves the native overview playhead without reading",
  from: "  const tracks = useProjectState(state => state.document.tracks)",
  to: "  useProjectState(state => state.session.position)\n  const tracks = useProjectState(state => state.document.tracks)",
}

const id = process.env.R2_MINIMAP_MUTATION
if (id) {
  if (id !== minimapMutation.id) throw new Error(`Unknown minimap mutation: ${id}`)
  const target = path.resolve(import.meta.dir, "../../../../..", minimapMutation.file)
  const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  Bun.plugin({
    name: "r2-minimap-mutation",
    setup(build) {
      build.onLoad({ filter }, async args => {
        const source = await Bun.file(args.path).text()
        const first = source.indexOf(minimapMutation.from)
        if (
          first === -1 ||
          source.indexOf(minimapMutation.from, first + minimapMutation.from.length) >= 0
        )
          throw new Error(`Mutation target drift: ${id}`)
        process.stderr.write(`[r2-minimap-mutation] applied ${id}\n`)
        return {
          contents: source.replace(minimapMutation.from, () => minimapMutation.to),
          loader: "tsx",
        }
      })
    },
  })
}
