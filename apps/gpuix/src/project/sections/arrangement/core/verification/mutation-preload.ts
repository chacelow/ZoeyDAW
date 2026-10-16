import path from "node:path"

const id = process.env.CORE_MUTATION
if (id) {
  const file = process.env.CORE_MUTATION_FILE
  const from = process.env.CORE_MUTATION_FROM
  const to = process.env.CORE_MUTATION_TO
  if (!file || !from || to === undefined) throw new Error(`Incomplete core mutation: ${id}`)
  const target = path.resolve(import.meta.dir, "..", file)
  const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  Bun.plugin({
    name: "core-mutation",
    setup(build) {
      build.onLoad({ filter }, async args => {
        const source = await Bun.file(args.path).text()
        const first = source.indexOf(from)
        if (first === -1 || source.indexOf(from, first + from.length) >= 0)
          throw new Error(`Mutation target drift: ${id}`)
        process.stderr.write(`[core-mutation] applied ${id}\n`)
        return {
          contents: source.replace(from, () => to),
          loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
        }
      })
    },
  })
}
